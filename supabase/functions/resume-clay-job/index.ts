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

    console.log(`[resume-clay-job] Starting resume for job ${jobId}`);

    // Get the pipeline job
    const { data: job, error: jobError } = await supabase
      .from("pipeline_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      console.error(`[resume-clay-job] Job not found:`, jobError);
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (job.type !== "CLAY_GENERATION") {
      return new Response(
        JSON.stringify({ error: "Only CLAY_GENERATION jobs can be resumed with this function" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get context from the job
    const context = job.origin_context || {};
    const brandId = context.brandId as string;
    const slots = (context.slots as string[]) || ["A", "B", "C", "D"];
    const model = (context.model as string) || "google/gemini-2.5-flash-image-preview";

    if (!brandId) {
      return new Response(
        JSON.stringify({ error: "Job context missing brandId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
    EdgeRuntime.waitUntil(processRemainingImages(supabase, jobId, brandId, slots, model));

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Job resume started in background",
        jobId 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[resume-clay-job] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function processRemainingImages(
  supabase: any,
  jobId: string,
  brandId: string,
  slots: string[],
  model: string
) {
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
  
  try {
    console.log(`[resume-clay-job] Processing remaining images for brand ${brandId}, slots: ${slots.join(",")}`);

    // Get all product images for this brand/slots that DON'T have clay images yet
    const { data: pendingImages, error: queryError } = await supabase
      .from("product_images")
      .select(`
        id,
        stored_url,
        source_url,
        slot,
        products!inner(brand_id)
      `)
      .eq("products.brand_id", brandId)
      .in("slot", slots);

    if (queryError) {
      console.error(`[resume-clay-job] Query error:`, queryError);
      await markJobFailed(supabase, jobId, "Failed to query images");
      return;
    }

    // Get existing clay images to filter out already-processed
    const imageIds = pendingImages.map((img: any) => img.id);
    const { data: existingClays } = await supabase
      .from("clay_images")
      .select("product_image_id")
      .in("product_image_id", imageIds);

    const existingSet = new Set((existingClays || []).map((c: any) => c.product_image_id));
    const remaining = pendingImages.filter((img: any) => !existingSet.has(img.id));

    console.log(`[resume-clay-job] Found ${remaining.length} remaining images to process`);

    if (remaining.length === 0) {
      await supabase
        .from("pipeline_jobs")
        .update({
          status: "COMPLETED",
          completed_at: new Date().toISOString(),
          progress_message: "All images already processed"
        })
        .eq("id", jobId);
      return;
    }

    // Update total to reflect only remaining
    const alreadyDone = existingSet.size;
    await supabase
      .from("pipeline_jobs")
      .update({
        progress_done: alreadyDone,
        progress_message: `Resuming from ${alreadyDone}/${alreadyDone + remaining.length}`
      })
      .eq("id", jobId);

    // Process each remaining image
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < remaining.length; i++) {
      const img = remaining[i];
      
      // Check if job was canceled/paused
      const { data: currentJob } = await supabase
        .from("pipeline_jobs")
        .select("status")
        .eq("id", jobId)
        .single();

      if (currentJob?.status === "CANCELED" || currentJob?.status === "PAUSED") {
        console.log(`[resume-clay-job] Job ${jobId} was ${currentJob.status}, stopping`);
        break;
      }

      try {
        // Call generate-clay-single for this image
        const response = await supabase.functions.invoke("generate-clay-single", {
          body: { imageId: img.id, model }
        });

        if (response.error) {
          console.error(`[resume-clay-job] Error for image ${img.id}:`, response.error);
          failCount++;
        } else {
          successCount++;
        }
      } catch (err) {
        console.error(`[resume-clay-job] Exception for image ${img.id}:`, err);
        failCount++;
      }

      // Update progress
      await supabase
        .from("pipeline_jobs")
        .update({
          progress_done: alreadyDone + successCount + failCount,
          progress_failed: failCount,
          progress_message: `Processing ${i + 1}/${remaining.length}`,
          updated_at: new Date().toISOString()
        })
        .eq("id", jobId);

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));
    }

    // Mark complete
    await supabase
      .from("pipeline_jobs")
      .update({
        status: failCount > 0 && successCount === 0 ? "FAILED" : "COMPLETED",
        completed_at: new Date().toISOString(),
        progress_message: failCount > 0 
          ? `Completed with ${failCount} failures`
          : "Completed successfully"
      })
      .eq("id", jobId);

    console.log(`[resume-clay-job] Finished job ${jobId}: ${successCount} success, ${failCount} failed`);
  } catch (error) {
    console.error(`[resume-clay-job] Background processing error:`, error);
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
