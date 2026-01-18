import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Time limit for each worker invocation (50 seconds - Deno kills at ~60-90s)
const MAX_PROCESSING_TIME_MS = 50 * 1000;

// Concurrency for parallel processing
const CONCURRENCY = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { batchId, pipelineJobId, model, resumeContext } = await req.json();

    if (!batchId) {
      return new Response(
        JSON.stringify({ error: "batchId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[process-repose-queue] Starting for batch ${batchId}, job ${pipelineJobId}, model: ${model}`);

    // If no pipeline job provided, find existing or error
    if (!pipelineJobId) {
      return new Response(
        JSON.stringify({ error: "pipelineJobId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update job to RUNNING
    await supabase
      .from("pipeline_jobs")
      .update({
        status: "RUNNING",
        progress_message: "Processing queue...",
        updated_at: new Date().toISOString(),
      })
      .eq("id", pipelineJobId);

    // Update batch status
    await supabase
      .from("repose_batches")
      .update({ status: "RUNNING" })
      .eq("id", batchId);

    // Reset any stuck running runs to queued
    const { error: resetError } = await supabase
      .from("repose_runs")
      .update({ status: "queued", started_at: null })
      .eq("batch_id", batchId)
      .eq("status", "running");

    if (resetError) {
      console.warn(`[process-repose-queue] Failed to reset running runs:`, resetError);
    }

    // Start background processing
    EdgeRuntime.waitUntil(
      processQueueBackground(supabase, batchId, pipelineJobId, model || "google/gemini-3-pro-image-preview", resumeContext)
    );

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Queue processing started in background",
        pipelineJobId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[process-repose-queue] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function processQueueBackground(
  supabase: any,
  batchId: string,
  pipelineJobId: string,
  model: string,
  resumeContext?: { processedRunIds?: string[] }
) {
  const startTime = Date.now();
  const processedRunIds = new Set<string>(resumeContext?.processedRunIds || []);

  // Helper to check if approaching timeout
  const isNearTimeout = () => (Date.now() - startTime) > MAX_PROCESSING_TIME_MS;

  // Helper for self-continuation
  const continueLater = async () => {
    console.log(`[process-repose-queue] Approaching timeout, scheduling continuation...`);
    
    await supabase
      .from("pipeline_jobs")
      .update({
        progress_message: "Continuing in new worker...",
        updated_at: new Date().toISOString(),
      })
      .eq("id", pipelineJobId);

    await supabase.functions.invoke("process-repose-queue", {
      body: {
        batchId,
        pipelineJobId,
        model,
        resumeContext: { processedRunIds: Array.from(processedRunIds) },
      },
    });
    
    console.log("[process-repose-queue] Continuation scheduled");
  };

  try {
    console.log(`[process-repose-queue] Background processing started for batch ${batchId}`);

    // Main processing loop
    while (true) {
      // Check if job was canceled
      const { data: jobCheck } = await supabase
        .from("pipeline_jobs")
        .select("status")
        .eq("id", pipelineJobId)
        .single();

      if (jobCheck?.status === "CANCELED" || jobCheck?.status === "PAUSED") {
        console.log(`[process-repose-queue] Job ${pipelineJobId} was ${jobCheck.status}, stopping`);
        break;
      }

      // Check if near timeout
      if (isNearTimeout()) {
        await continueLater();
        return; // Exit this worker
      }

      // Get next batch of queued runs
      const { data: queuedRuns, error: queryError } = await supabase
        .from("repose_runs")
        .select("*")
        .eq("batch_id", batchId)
        .eq("status", "queued")
        .order("created_at", { ascending: true })
        .limit(CONCURRENCY);

      if (queryError) {
        console.error("[process-repose-queue] Query error:", queryError);
        break;
      }

      if (!queuedRuns?.length) {
        console.log("[process-repose-queue] No more queued runs");
        break;
      }

      console.log(`[process-repose-queue] Processing ${queuedRuns.length} runs`);

      // Process runs concurrently
      await Promise.all(
        queuedRuns.map((run: any) => processRun(supabase, run, batchId, model, pipelineJobId, processedRunIds))
      );

      // Update progress
      const { data: stats } = await supabase
        .from("repose_runs")
        .select("status")
        .eq("batch_id", batchId);

      if (stats) {
        const complete = stats.filter((r: any) => r.status === "complete").length;
        const failed = stats.filter((r: any) => r.status === "failed").length;
        const total = stats.length;

        await supabase
          .from("pipeline_jobs")
          .update({
            progress_done: complete,
            progress_failed: failed,
            progress_total: total,
            progress_message: `Processing ${complete + failed}/${total}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", pipelineJobId);
      }

      // Small delay between batches
      await new Promise((r) => setTimeout(r, 500));
    }

    // Check final status
    const { data: finalStats } = await supabase
      .from("repose_runs")
      .select("status")
      .eq("batch_id", batchId);

    const complete = finalStats?.filter((r: any) => r.status === "complete").length || 0;
    const failed = finalStats?.filter((r: any) => r.status === "failed").length || 0;
    const queued = finalStats?.filter((r: any) => r.status === "queued").length || 0;

    // Only mark as completed if no more queued
    if (queued === 0) {
      const finalStatus = failed > 0 && complete === 0 ? "FAILED" : "COMPLETED";
      
      await supabase
        .from("pipeline_jobs")
        .update({
          status: finalStatus,
          completed_at: new Date().toISOString(),
          progress_message: failed > 0 ? `Completed with ${failed} failures` : "Completed successfully",
        })
        .eq("id", pipelineJobId);

      await supabase
        .from("repose_batches")
        .update({ status: finalStatus === "COMPLETED" ? "COMPLETE" : "FAILED" })
        .eq("id", batchId);
    }

    console.log(`[process-repose-queue] Finished: ${complete} complete, ${failed} failed, ${queued} queued`);
  } catch (error) {
    console.error("[process-repose-queue] Background processing error:", error);
    await markJobFailed(supabase, pipelineJobId, error instanceof Error ? error.message : "Unknown error");
  }
}

async function processRun(
  supabase: any,
  run: any,
  batchId: string,
  model: string,
  pipelineJobId: string,
  processedRunIds: Set<string>
) {
  const runId = run.id;
  const lookId = run.look_id;
  const brandId = (run.config_snapshot as any)?.brand_id || run.brand_id;

  try {
    console.log(`[process-repose-queue] Processing run ${runId} for look ${lookId}`);

    // Mark as running
    await supabase
      .from("repose_runs")
      .update({ 
        status: "running", 
        started_at: new Date().toISOString(),
        heartbeat_at: new Date().toISOString(),
      })
      .eq("id", runId);

    // Get batch items for this look
    const { data: batchItems } = await supabase
      .from("repose_batch_items")
      .select("*")
      .eq("batch_id", batchId);

    // Also check job_outputs for look_id mapping
    const outputIds = batchItems?.map((i: any) => i.source_output_id).filter(Boolean) || [];
    let lookItemsWithMapping: any[] = batchItems?.filter((i: any) => i.look_id === lookId) || [];

    if (outputIds.length > 0) {
      const { data: outputs } = await supabase
        .from("job_outputs")
        .select("id, job:unified_jobs(look_id)")
        .in("id", outputIds);

      const outputLookMap: Record<string, string> = {};
      outputs?.forEach((o: any) => {
        if (o.job?.look_id) outputLookMap[o.id] = o.job.look_id;
      });

      // Add items that map to this look via output
      batchItems?.forEach((item: any) => {
        if (outputLookMap[item.source_output_id] === lookId && !lookItemsWithMapping.some((l: any) => l.id === item.id)) {
          lookItemsWithMapping.push(item);
        }
      });
    }

    if (!lookItemsWithMapping.length) {
      console.log(`[process-repose-queue] No batch items for look ${lookId}`);
      await supabase
        .from("repose_runs")
        .update({ status: "complete", completed_at: new Date().toISOString(), output_count: 0 })
        .eq("id", runId);
      processedRunIds.add(runId);
      return;
    }

    // Get look product type
    const { data: lookDetail } = await supabase
      .from("talent_looks")
      .select("product_type")
      .eq("id", lookId)
      .single();

    const productType = lookDetail?.product_type || "top";

    // Get the brand library
    const { data: library } = await supabase
      .from("brand_pose_libraries")
      .select("id")
      .eq("brand_id", brandId)
      .single();

    if (!library) {
      throw new Error("No pose library found for brand");
    }

    // Get usable poses
    const { data: poses } = await supabase
      .from("library_poses")
      .select(`
        id,
        slot,
        product_type,
        clay_images (id, stored_url)
      `)
      .eq("library_id", library.id)
      .in("curation_status", ["approved", "pending"])
      .not("clay_images", "is", null);

    if (!poses?.length) {
      throw new Error("No usable poses found in library");
    }

    console.log(`[process-repose-queue] Found ${poses.length} usable poses for run ${runId}`);

    // Create output records
    const posesPerType = (run.config_snapshot as any)?.posesPerShotType || 2;
    const outputsToCreate: any[] = [];

    for (const item of lookItemsWithMapping) {
      const view = (item.view || "").toLowerCase();
      let shotTypes: string[] = [];

      if (view.includes("front")) {
        shotTypes = ["FRONT_FULL", "FRONT_CROPPED", "DETAIL"];
      } else if (view.includes("back")) {
        shotTypes = ["BACK_FULL"];
      } else if (view.includes("detail")) {
        shotTypes = ["DETAIL"];
      }

      for (const shotType of shotTypes) {
        // Filter poses by slot - each shot type uses its dedicated slot
        let relevantPoses = poses.filter((p: any) => {
          const slot = (p.slot || "").toUpperCase();
          // Slot A = FRONT_FULL only (full-front clay poses)
          if (shotType === "FRONT_FULL") {
            return slot.includes("A");
          }
          // Slot B = FRONT_CROPPED only (cropped-front clay poses, filtered by product_type below)
          if (shotType === "FRONT_CROPPED") {
            return slot.includes("B");
          }
          // Slot C = BACK_FULL
          if (shotType === "BACK_FULL") return slot.includes("C");
          // Slot D = DETAIL
          if (shotType === "DETAIL") return slot.includes("D");
          return false;
        });

        // For FRONT_CROPPED, filter by product_type to use correct crop poses
        // Top → clay poses for upper-body crops, Trousers → clay poses for lower-body crops
        if (shotType === "FRONT_CROPPED") {
          const desiredPoseType = productType === "trousers" ? "trousers" : "top";
          const matchingPoses = relevantPoses.filter((p: any) => {
            const poseProductType = (p.product_type || "").toLowerCase();
            if (desiredPoseType === "top") {
              return poseProductType === "top" || poseProductType === "tops";
            }
            return poseProductType === desiredPoseType;
          });

          if (matchingPoses.length > 0) {
            console.log(`[process-repose-queue] Using ${matchingPoses.length} ${desiredPoseType} poses for FRONT_CROPPED`);
            relevantPoses = matchingPoses;
          } else {
            console.log(`[process-repose-queue] No ${desiredPoseType} poses found, using all ${relevantPoses.length} FRONT_CROPPED poses`);
          }
        }

        // Random selection
        const shuffled = relevantPoses.sort(() => Math.random() - 0.5);
        const selectedPoses = shuffled.slice(0, posesPerType);

        for (const pose of selectedPoses) {
          const clayImage = pose.clay_images as { id: string; stored_url: string } | null;
          if (!clayImage?.id || !clayImage?.stored_url) continue;

          outputsToCreate.push({
            batch_id: batchId,
            batch_item_id: item.id,
            run_id: runId,
            pose_id: clayImage.id,
            pose_url: clayImage.stored_url,
            shot_type: shotType,
            attempt_index: 0,
            status: "queued",
          });
        }
      }
    }

    if (outputsToCreate.length === 0) {
      console.log(`[process-repose-queue] No outputs to create for run ${runId}`);
      await supabase
        .from("repose_runs")
        .update({ status: "complete", completed_at: new Date().toISOString(), output_count: 0 })
        .eq("id", runId);
      processedRunIds.add(runId);
      return;
    }

    console.log(`[process-repose-queue] Creating ${outputsToCreate.length} outputs for run ${runId}`);

    const { data: createdOutputs, error: insertError } = await supabase
      .from("repose_outputs")
      .insert(outputsToCreate)
      .select("id");

    if (insertError) {
      console.error(`[process-repose-queue] Failed to insert outputs:`, insertError);
      throw insertError;
    }

    // Generate each output
    let successCount = 0;
    let failCount = 0;

    for (const output of createdOutputs || []) {
      try {
        console.log(`[process-repose-queue] Generating output ${output.id}`);
        
        const { error } = await supabase.functions.invoke("generate-repose-single", {
          body: { outputId: output.id, model },
        });

        if (error) {
          console.error(`[process-repose-queue] Generation failed for ${output.id}:`, error);
          await supabase
            .from("repose_outputs")
            .update({ status: "failed" })
            .eq("id", output.id);
          failCount++;
        } else {
          successCount++;
        }
      } catch (err) {
        console.error(`[process-repose-queue] Error generating ${output.id}:`, err);
        await supabase
          .from("repose_outputs")
          .update({ status: "failed" })
          .eq("id", output.id);
        failCount++;
      }

      // Update heartbeat
      await supabase
        .from("repose_runs")
        .update({ heartbeat_at: new Date().toISOString() })
        .eq("id", runId);

      // Small delay for rate limiting
      await new Promise((r) => setTimeout(r, 300));
    }

    console.log(`[process-repose-queue] Run ${runId} complete: ${successCount} success, ${failCount} failed`);

    await supabase
      .from("repose_runs")
      .update({
        status: failCount === createdOutputs?.length ? "failed" : "complete",
        completed_at: new Date().toISOString(),
        output_count: successCount,
        error_message: failCount > 0 ? `${failCount} outputs failed` : null,
      })
      .eq("id", runId);

    processedRunIds.add(runId);
  } catch (error) {
    console.error(`[process-repose-queue] Run ${runId} failed:`, error);
    await supabase
      .from("repose_runs")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Unknown error",
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    processedRunIds.add(runId);
  }
}

async function markJobFailed(supabase: any, jobId: string, message: string) {
  await supabase
    .from("pipeline_jobs")
    .update({
      status: "FAILED",
      completed_at: new Date().toISOString(),
      progress_message: message,
    })
    .eq("id", jobId);
}
