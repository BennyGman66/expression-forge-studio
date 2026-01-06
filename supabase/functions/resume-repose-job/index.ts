import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { jobId } = await req.json();

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: "jobId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[resume-repose-job] Starting resume for job ${jobId}`);

    // Get the pipeline job
    const { data: job, error: jobError } = await supabase
      .from("pipeline_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      console.error(`[resume-repose-job] Job not found:`, jobError);
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (job.type !== "REPOSE_GENERATION") {
      return new Response(
        JSON.stringify({ error: "Only REPOSE_GENERATION jobs can be resumed with this function" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get context from the job
    const context = job.origin_context || {};
    const batchId = context.batchId as string;
    const model = (context.model as string) || "google/gemini-2.5-flash";

    if (!batchId) {
      return new Response(
        JSON.stringify({ error: "Job context missing batchId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Reset any stuck 'running' outputs to 'queued'
    const { error: resetError } = await supabase
      .from("repose_outputs")
      .update({ status: "queued" })
      .eq("batch_id", batchId)
      .eq("status", "running");

    if (resetError) {
      console.warn(`[resume-repose-job] Failed to reset running outputs:`, resetError);
    }

    // Update batch status to RUNNING
    await supabase
      .from("repose_batches")
      .update({ status: "RUNNING" })
      .eq("id", batchId);

    // Set job status to RUNNING
    await supabase
      .from("pipeline_jobs")
      .update({ 
        status: "RUNNING",
        started_at: new Date().toISOString(),
        progress_message: "Resuming..."
      })
      .eq("id", jobId);

    // Start background processing
    EdgeRuntime.waitUntil(processQueuedOutputs(supabase, jobId, batchId, model));

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Job resume started in background",
        jobId 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[resume-repose-job] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function processQueuedOutputs(
  supabase: any,
  jobId: string,
  batchId: string,
  model: string
) {
  try {
    console.log(`[resume-repose-job] Processing queued outputs for batch ${batchId}`);

    // Get all queued outputs for this batch
    const { data: queuedOutputs, error: queryError } = await supabase
      .from("repose_outputs")
      .select("id")
      .eq("batch_id", batchId)
      .eq("status", "queued");

    if (queryError) {
      console.error(`[resume-repose-job] Query error:`, queryError);
      await markJobFailed(supabase, jobId, "Failed to query outputs");
      return;
    }

    console.log(`[resume-repose-job] Found ${queuedOutputs?.length || 0} queued outputs to process`);

    if (!queuedOutputs || queuedOutputs.length === 0) {
      // Check if there are any outputs at all
      const { data: allOutputs } = await supabase
        .from("repose_outputs")
        .select("status")
        .eq("batch_id", batchId);

      const completed = allOutputs?.filter((o: any) => o.status === "complete").length || 0;
      const failed = allOutputs?.filter((o: any) => o.status === "failed").length || 0;

      await supabase
        .from("pipeline_jobs")
        .update({
          status: "COMPLETED",
          completed_at: new Date().toISOString(),
          progress_done: completed,
          progress_failed: failed,
          progress_message: "All outputs already processed"
        })
        .eq("id", jobId);

      await supabase
        .from("repose_batches")
        .update({ status: "COMPLETE" })
        .eq("id", batchId);

      return;
    }

    // Get current progress to continue from
    const { data: currentJob } = await supabase
      .from("pipeline_jobs")
      .select("progress_done, progress_failed, progress_total")
      .eq("id", jobId)
      .single();

    let successCount = currentJob?.progress_done || 0;
    let failCount = currentJob?.progress_failed || 0;
    const total = currentJob?.progress_total || (successCount + failCount + queuedOutputs.length);

    // Process each queued output
    for (let i = 0; i < queuedOutputs.length; i++) {
      const output = queuedOutputs[i];
      
      // Check if job was canceled/paused
      const { data: jobCheck } = await supabase
        .from("pipeline_jobs")
        .select("status")
        .eq("id", jobId)
        .single();

      if (jobCheck?.status === "CANCELED" || jobCheck?.status === "PAUSED") {
        console.log(`[resume-repose-job] Job ${jobId} was ${jobCheck.status}, stopping`);
        break;
      }

      try {
        console.log(`[resume-repose-job] Processing output ${output.id} (${i + 1}/${queuedOutputs.length})`);

        // Call generate-repose-single for this output
        const response = await supabase.functions.invoke("generate-repose-single", {
          body: { outputId: output.id, model }
        });

        if (response.error) {
          console.error(`[resume-repose-job] Error for output ${output.id}:`, response.error);
          failCount++;
        } else {
          successCount++;
        }
      } catch (err) {
        console.error(`[resume-repose-job] Exception for output ${output.id}:`, err);
        failCount++;
      }

      // Update progress
      await supabase
        .from("pipeline_jobs")
        .update({
          progress_done: successCount,
          progress_failed: failCount,
          progress_message: `Processing ${successCount + failCount}/${total}`,
          updated_at: new Date().toISOString()
        })
        .eq("id", jobId);

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));
    }

    // Mark complete
    const finalStatus = failCount > 0 && successCount === 0 ? "FAILED" : "COMPLETED";
    await supabase
      .from("pipeline_jobs")
      .update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
        progress_message: failCount > 0 
          ? `Completed with ${failCount} failures`
          : "Completed successfully"
      })
      .eq("id", jobId);

    // Update batch status
    await supabase
      .from("repose_batches")
      .update({ 
        status: finalStatus === "COMPLETED" ? "COMPLETE" : "FAILED" 
      })
      .eq("id", batchId);

    console.log(`[resume-repose-job] Finished job ${jobId}: ${successCount} success, ${failCount} failed`);
  } catch (error) {
    console.error(`[resume-repose-job] Background processing error:`, error);
    await markJobFailed(supabase, jobId, error instanceof Error ? error.message : "Unknown error");
  }
}

async function markJobFailed(supabase: any, jobId: string, message: string) {
  await supabase
    .from("pipeline_jobs")
    .update({
      status: "FAILED",
      completed_at: new Date().toISOString(),
      progress_message: message
    })
    .eq("id", jobId);
}
