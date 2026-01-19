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

// Lower concurrency for 4K - larger images take longer
const OUTPUT_CONCURRENCY = 2;

// Retry settings for failed generations
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

// Heartbeat logging interval
const LOG_INTERVAL_MS = 10 * 1000;

// Stale output threshold (2 minutes without progress)
const STALE_THRESHOLD_MS = 2 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { batchId, pipelineJobId, imageSize, outputIds, resumeContext } = await req.json();

    if (!batchId || !pipelineJobId) {
      return new Response(
        JSON.stringify({ error: "batchId and pipelineJobId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[process-repose-queue-4k] Starting for batch ${batchId}, job ${pipelineJobId}, imageSize: ${imageSize}`);

    // Update job to RUNNING
    await supabase
      .from("pipeline_jobs")
      .update({
        status: "RUNNING",
        progress_message: "Processing 4K queue...",
        updated_at: new Date().toISOString(),
      })
      .eq("id", pipelineJobId);

    // Reset stale running outputs (stuck for > 2 minutes)
    const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();
    const { data: staleOutputs } = await supabase
      .from("repose_outputs")
      .update({ status: "queued" })
      .eq("batch_id", batchId)
      .eq("status", "running")
      .lt("created_at", staleThreshold)
      .select("id");

    if (staleOutputs?.length) {
      console.log(`[process-repose-queue-4k] Reset ${staleOutputs.length} stale running outputs`);
    }

    // Track processed outputs for continuation
    const processedIds: Set<string> = resumeContext?.processedIds
      ? new Set(resumeContext.processedIds)
      : new Set();

    // Start background processing
    EdgeRuntime.waitUntil(
      processQueueBackground(
        supabase,
        batchId,
        pipelineJobId,
        imageSize || "4K",
        outputIds || [],
        processedIds,
        startTime
      )
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: "4K queue processing started in background",
        pipelineJobId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[process-repose-queue-4k] Error:", error);
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
  imageSize: string,
  targetOutputIds: string[],
  processedIds: Set<string>,
  startTime: number
) {
  let lastLogTime = Date.now();

  // Helper to log stats
  async function logHeartbeat() {
    // Query outputs for this job specifically
    let query = supabase
      .from("repose_outputs")
      .select("id, status")
      .eq("batch_id", batchId)
      .eq("status", "queued");

    if (targetOutputIds.length > 0) {
      query = query.in("id", targetOutputIds);
    }

    const { data: queuedOutputs } = await query;

    const { data: allOutputs } = await supabase
      .from("repose_outputs")
      .select("id, status")
      .eq("batch_id", batchId)
      .in("id", targetOutputIds.length > 0 ? targetOutputIds : [batchId]); // Fallback query

    const running = allOutputs?.filter((o: any) => o.status === "running").length || 0;
    const queued = queuedOutputs?.length || 0;
    const complete = allOutputs?.filter((o: any) => o.status === "complete").length || 0;
    const failed = allOutputs?.filter((o: any) => o.status === "failed").length || 0;
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    console.log(`[process-repose-queue-4k] Heartbeat: ${complete} complete, ${running} running, ${queued} queued, ${failed} failed, elapsed ${elapsed}s`);
    lastLogTime = Date.now();

    // Update job progress
    await supabase
      .from("pipeline_jobs")
      .update({
        progress_done: complete,
        progress_failed: failed,
        progress_total: targetOutputIds.length || (complete + running + queued + failed),
        progress_message: `4K Rendering: ${complete}/${targetOutputIds.length || (complete + running + queued + failed)}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pipelineJobId);

    return { complete, running, queued, failed };
  }

  // Helper to continue in a new worker
  async function continueLater() {
    console.log(`[process-repose-queue-4k] Approaching timeout, continuing in new worker...`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    await fetch(`${supabaseUrl}/functions/v1/process-repose-queue-4k`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        batchId,
        pipelineJobId,
        imageSize,
        outputIds: targetOutputIds,
        resumeContext: {
          processedIds: Array.from(processedIds),
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

      // Check if job was cancelled
      const { data: job } = await supabase
        .from("pipeline_jobs")
        .select("status")
        .eq("id", pipelineJobId)
        .single();

      if (job?.status === "CANCELLED" || job?.status === "PAUSED") {
        console.log(`[process-repose-queue-4k] Job ${job.status}, stopping`);
        return;
      }

      // Fetch next batch of queued outputs
      let query = supabase
        .from("repose_outputs")
        .select("id, pose_url, shot_type")
        .eq("batch_id", batchId)
        .eq("status", "queued")
        .order("created_at", { ascending: true })
        .limit(OUTPUT_CONCURRENCY);

      if (targetOutputIds.length > 0) {
        query = query.in("id", targetOutputIds);
      }

      const { data: queuedOutputs } = await query;

      if (!queuedOutputs?.length) {
        console.log(`[process-repose-queue-4k] No more queued outputs, finishing`);
        break;
      }

      console.log(`[process-repose-queue-4k] Processing ${queuedOutputs.length} outputs at ${imageSize}`);

      // Process outputs concurrently
      const results = await Promise.allSettled(
        queuedOutputs.map((output: any) =>
          processOutput(supabase, output.id, imageSize, processedIds)
        )
      );

      // Count results
      let batchSuccess = 0;
      let batchFail = 0;
      for (const result of results) {
        if (result.status === "fulfilled" && result.value.success) {
          batchSuccess++;
        } else {
          batchFail++;
        }
      }

      console.log(`[process-repose-queue-4k] Batch complete: ${batchSuccess} success, ${batchFail} failed`);

      // Small delay between batches
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Final stats
    const finalStats = await logHeartbeat();

    // Finalize job
    const finalStatus =
      finalStats.queued > 0 || finalStats.running > 0
        ? "RUNNING"
        : finalStats.failed > 0 && finalStats.complete === 0
        ? "FAILED"
        : "COMPLETED";

    await supabase
      .from("pipeline_jobs")
      .update({
        status: finalStatus,
        completed_at: finalStatus !== "RUNNING" ? new Date().toISOString() : null,
        progress_message:
          finalStatus === "COMPLETED"
            ? `4K Render complete: ${finalStats.complete} images`
            : finalStatus === "FAILED"
            ? `4K Render failed: ${finalStats.failed} errors`
            : `4K Render in progress: ${finalStats.queued + finalStats.running} remaining`,
      })
      .eq("id", pipelineJobId);

    console.log(`[process-repose-queue-4k] Job finished with status ${finalStatus}`);
  } catch (error) {
    console.error("[process-repose-queue-4k] Background error:", error);
    await supabase
      .from("pipeline_jobs")
      .update({
        status: "FAILED",
        completed_at: new Date().toISOString(),
        progress_message: error instanceof Error ? error.message : "Unknown error",
      })
      .eq("id", pipelineJobId);
  }
}

async function processOutput(
  supabase: any,
  outputId: string,
  imageSize: string,
  processedIds: Set<string>
): Promise<{ success: boolean }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[process-repose-queue-4k] Retry ${attempt} for output ${outputId}`);
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
      }

      // Call the single generation function with imageSize
      const { error } = await supabase.functions.invoke("generate-repose-single", {
        body: { outputId, imageSize },
      });

      if (error) {
        lastError = error;
        console.error(
          `[process-repose-queue-4k] Generation attempt ${attempt + 1} failed for ${outputId}:`,
          error.message || error
        );

        // Retry on 503/504 errors
        if (
          error.message?.includes("503") ||
          error.message?.includes("504") ||
          error.message?.includes("Service Unavailable") ||
          error.message?.includes("Gateway Timeout")
        ) {
          continue;
        }
        // Other errors, don't retry
        break;
      }

      processedIds.add(outputId);
      return { success: true };
    } catch (err) {
      lastError = err as Error;
      console.error(
        `[process-repose-queue-4k] Error attempt ${attempt + 1} for ${outputId}:`,
        (err as Error).message
      );

      // Retry on network errors
      if (attempt < MAX_RETRIES) {
        continue;
      }
    }
  }

  // All retries exhausted
  console.error(`[process-repose-queue-4k] All retries failed for ${outputId}`);
  await supabase
    .from("repose_outputs")
    .update({
      status: "failed",
      error_message: lastError?.message || "Unknown error after retries",
    })
    .eq("id", outputId);

  processedIds.add(outputId);
  return { success: false };
}
