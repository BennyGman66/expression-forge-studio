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

// Concurrency for parallel processing (runs level)
const RUN_CONCURRENCY = 3;

// Concurrency for output generation within a run
const OUTPUT_CONCURRENCY = 10;

// Heartbeat logging interval
const LOG_INTERVAL_MS = 10 * 1000;

// Stale run threshold (2 minutes without heartbeat)
const STALE_RUN_THRESHOLD_MS = 2 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

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

    // Reset stale running runs (no heartbeat for > 2 minutes)
    const staleThreshold = new Date(Date.now() - STALE_RUN_THRESHOLD_MS).toISOString();
    const { data: staleRuns } = await supabase
      .from("repose_runs")
      .update({ status: "queued", started_at: null, heartbeat_at: null })
      .eq("batch_id", batchId)
      .eq("status", "running")
      .lt("heartbeat_at", staleThreshold)
      .select("id");

    if (staleRuns?.length) {
      console.log(`[process-repose-queue] Reset ${staleRuns.length} stale running runs (no heartbeat > 2min)`);
    }

    // Also reset runs without any heartbeat (crashed before first heartbeat)
    const { data: noHeartbeatRuns } = await supabase
      .from("repose_runs")
      .update({ status: "queued", started_at: null })
      .eq("batch_id", batchId)
      .eq("status", "running")
      .is("heartbeat_at", null)
      .select("id");

    if (noHeartbeatRuns?.length) {
      console.log(`[process-repose-queue] Reset ${noHeartbeatRuns.length} runs without heartbeat`);
    }

    // Track processed runs for continuation
    const processedRunIds: Set<string> = resumeContext?.processedRunIds
      ? new Set(resumeContext.processedRunIds)
      : new Set();

    // Start background processing
    EdgeRuntime.waitUntil(
      processQueueBackground(supabase, batchId, pipelineJobId, model || "google/gemini-3-pro-image-preview", processedRunIds, startTime)
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
  pipelineJobId: string | null,
  model: string,
  processedRunIds: Set<string>,
  startTime: number
) {
  let lastLogTime = Date.now();

  // Helper to log stats
  async function logHeartbeat() {
    const { data: stats } = await supabase
      .from("repose_runs")
      .select("status")
      .eq("batch_id", batchId);

    const running = stats?.filter((r: any) => r.status === "running").length || 0;
    const queued = stats?.filter((r: any) => r.status === "queued").length || 0;
    const complete = stats?.filter((r: any) => r.status === "complete").length || 0;
    const failed = stats?.filter((r: any) => r.status === "failed").length || 0;
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    console.log(`[process-repose-queue] Heartbeat: ${complete} complete, ${running} running, ${queued} queued, ${failed} failed, elapsed ${elapsed}s`);
    lastLogTime = Date.now();
  }

  // Helper to continue processing in a new worker
  async function continueLater() {
    console.log(`[process-repose-queue] Approaching timeout, continuing in new worker...`);
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    await fetch(`${supabaseUrl}/functions/v1/process-repose-queue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        batchId,
        pipelineJobId,
        model,
        resumeContext: {
          processedRunIds: Array.from(processedRunIds),
        },
      }),
    });
  }

  try {
    // Main processing loop
    while (true) {
      // Check if we're approaching timeout
      if (Date.now() - startTime > MAX_PROCESSING_TIME_MS) {
        await continueLater();
        return;
      }

      // Log heartbeat periodically
      if (Date.now() - lastLogTime > LOG_INTERVAL_MS) {
        await logHeartbeat();
      }

      // Check if job was cancelled or paused
      if (pipelineJobId) {
        const { data: job } = await supabase
          .from("pipeline_jobs")
          .select("status")
          .eq("id", pipelineJobId)
          .single();

        if (job?.status === "CANCELLED" || job?.status === "PAUSED") {
          console.log(`[process-repose-queue] Job ${job.status}, stopping`);
          return;
        }
      }

      // Fetch next batch of queued runs
      const { data: queuedRuns } = await supabase
        .from("repose_runs")
        .select("id, look_id, brand_id, config_snapshot")
        .eq("batch_id", batchId)
        .eq("status", "queued")
        .order("created_at", { ascending: true })
        .limit(RUN_CONCURRENCY);

      if (!queuedRuns?.length) {
        console.log(`[process-repose-queue] No more queued runs, finishing`);
        break;
      }

      console.log(`[process-repose-queue] Processing ${queuedRuns.length} runs`);

      // Process runs concurrently
      await Promise.all(
        queuedRuns.map((run: any) => processRun(supabase, run, batchId, model, pipelineJobId, processedRunIds))
      );

      // Update pipeline job progress
      if (pipelineJobId) {
        const { data: stats } = await supabase
          .from("repose_runs")
          .select("status")
          .eq("batch_id", batchId);

        const complete = stats?.filter((r: any) => r.status === "complete").length || 0;
        const failed = stats?.filter((r: any) => r.status === "failed").length || 0;
        const total = stats?.length || 0;

        await supabase
          .from("pipeline_jobs")
          .update({ 
            progress_done: complete, 
            progress_failed: failed,
            progress_total: total,
          })
          .eq("id", pipelineJobId);
      }
    }

    // Final log
    await logHeartbeat();

    // Finalize job
    if (pipelineJobId) {
      const { data: stats } = await supabase
        .from("repose_runs")
        .select("status")
        .eq("batch_id", batchId);

      const failed = stats?.filter((r: any) => r.status === "failed").length || 0;
      const finalStatus = failed > 0 ? "FAILED" : "COMPLETED";

      await supabase
        .from("pipeline_jobs")
        .update({ 
          status: finalStatus, 
          completed_at: new Date().toISOString() 
        })
        .eq("id", pipelineJobId);

      console.log(`[process-repose-queue] Job finished with status ${finalStatus}`);
    }

    // Update batch status
    await supabase
      .from("repose_batches")
      .update({ status: "COMPLETE" })
      .eq("id", batchId);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[process-repose-queue] Background error:", errorMessage);
    if (pipelineJobId) {
      await markJobFailed(supabase, pipelineJobId, errorMessage);
    }
  }
}

async function processRun(
  supabase: any,
  run: any,
  batchId: string,
  model: string,
  pipelineJobId: string | null,
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

        // For FRONT_CROPPED and DETAIL, filter by product_type to use correct poses
        // Top → clay poses for upper-body crops, Trousers → clay poses for lower-body crops
        if (shotType === "FRONT_CROPPED" || shotType === "DETAIL") {
          const desiredPoseType = productType === "trousers" ? "trousers" : "top";
          const matchingPoses = relevantPoses.filter((p: any) => {
            const poseProductType = (p.product_type || "").toLowerCase();
            if (desiredPoseType === "top") {
              return poseProductType === "top" || poseProductType === "tops";
            }
            return poseProductType === desiredPoseType;
          });

          if (matchingPoses.length > 0) {
            console.log(`[process-repose-queue] Using ${matchingPoses.length} ${desiredPoseType} poses for ${shotType}`);
            relevantPoses = matchingPoses;
          } else {
            console.log(`[process-repose-queue] No ${desiredPoseType} poses found, using all ${relevantPoses.length} ${shotType} poses`);
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

    // Generate outputs in parallel batches
    let successCount = 0;
    let failCount = 0;
    const outputs = createdOutputs || [];

    console.log(`[process-repose-queue] Processing ${outputs.length} outputs with concurrency ${OUTPUT_CONCURRENCY}`);

    // Process in batches of OUTPUT_CONCURRENCY
    for (let i = 0; i < outputs.length; i += OUTPUT_CONCURRENCY) {
      const batch = outputs.slice(i, i + OUTPUT_CONCURRENCY);
      
      console.log(`[process-repose-queue] Batch ${Math.floor(i / OUTPUT_CONCURRENCY) + 1}: processing ${batch.length} outputs in parallel`);
      
      const results = await Promise.allSettled(
        batch.map(async (output: { id: string }) => {
          try {
            const { error } = await supabase.functions.invoke("generate-repose-single", {
              body: { outputId: output.id, model },
            });
            
            if (error) {
              console.error(`[process-repose-queue] Generation failed for ${output.id}:`, error);
              await supabase
                .from("repose_outputs")
                .update({ status: "failed" })
                .eq("id", output.id);
              return { success: false };
            }
            return { success: true };
          } catch (err) {
            console.error(`[process-repose-queue] Error generating ${output.id}:`, err);
            await supabase
              .from("repose_outputs")
              .update({ status: "failed" })
              .eq("id", output.id);
            return { success: false };
          }
        })
      );

      // Count results
      for (const result of results) {
        if (result.status === "fulfilled" && result.value.success) {
          successCount++;
        } else {
          failCount++;
        }
      }

      // Update heartbeat after each batch
      await supabase
        .from("repose_runs")
        .update({ heartbeat_at: new Date().toISOString() })
        .eq("id", runId);

      // Small delay between batches to avoid overwhelming the API
      if (i + OUTPUT_CONCURRENCY < outputs.length) {
        await new Promise((r) => setTimeout(r, 100));
      }
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
