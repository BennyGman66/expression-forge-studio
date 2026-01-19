import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Resilience constants - battle-tested from process-repose-queue
const MAX_PROCESSING_TIME_MS = 50 * 1000; // 50s (Deno kills at 60-90s)
const OUTPUT_CONCURRENCY = 3; // Lower than normal queue due to 4K size
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000;
const LOG_INTERVAL_MS = 10 * 1000; // Heartbeat every 10s
const STALE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

interface ResumeContext {
  jobId: string;
  processedIds: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { batchId, lookIds, shotTypes, imageSize = "4K", resumeContext } = await req.json();

    if (!batchId) {
      return new Response(
        JSON.stringify({ error: "batchId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isResume = !!resumeContext;
    console.log(`[rerender-favorites-4k] ${isResume ? 'RESUMING' : 'Starting'} for batch ${batchId}, ${lookIds?.length || 'all'} looks, shotTypes: ${shotTypes?.join(',') || 'all'}, size: ${imageSize}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get batch info for brand_id
    const { data: batch, error: batchError } = await supabase
      .from("repose_batches")
      .select("brand_id")
      .eq("id", batchId)
      .single();

    if (batchError || !batch) {
      console.error("[rerender-favorites-4k] Failed to fetch batch:", batchError);
      return new Response(
        JSON.stringify({ error: "Batch not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build query for favorites
    let favoritesQuery = supabase
      .from("repose_outputs")
      .select(`
        id,
        batch_id,
        batch_item_id,
        pose_id,
        pose_url,
        shot_type,
        favorite_rank,
        repose_batch_items!batch_item_id(look_id)
      `)
      .eq("batch_id", batchId)
      .eq("is_favorite", true)
      .not("result_url", "is", null);

    // Filter by look IDs if provided
    if (lookIds && lookIds.length > 0) {
      const { data: batchItems } = await supabase
        .from("repose_batch_items")
        .select("id")
        .eq("batch_id", batchId)
        .in("look_id", lookIds);

      if (batchItems && batchItems.length > 0) {
        const batchItemIds = batchItems.map(bi => bi.id);
        favoritesQuery = favoritesQuery.in("batch_item_id", batchItemIds);
      }
    }

    // Filter by shot types if provided
    if (shotTypes && shotTypes.length > 0) {
      favoritesQuery = favoritesQuery.in("shot_type", shotTypes);
    }

    const { data: favorites, error: favError } = await favoritesQuery;

    if (favError) {
      console.error("[rerender-favorites-4k] Failed to fetch favorites:", favError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch favorites" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!favorites || favorites.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No favorites to re-render", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[rerender-favorites-4k] Found ${favorites.length} favorites to re-render at ${imageSize}`);

    // Handle resume context
    const processedIds = new Set<string>(resumeContext?.processedIds || []);
    let jobId = resumeContext?.jobId;

    // If not resuming, create a new pipeline job
    if (!isResume) {
      const { data: job, error: jobError } = await supabase
        .from("pipeline_jobs")
        .insert({
          type: "REPOSE_GENERATION",
          title: `Re-render ${favorites.length} favorites @ ${imageSize}`,
          status: "RUNNING",
          origin_route: `/repose-production/batch/${batchId}`,
          origin_context: {
            batchId,
            lookIds,
            shotTypes,
            isRerender: true,
            imageSize,
            favoriteCount: favorites.length,
          },
          progress_done: 0,
          progress_failed: 0,
          progress_total: favorites.length,
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (jobError) {
        console.error("[rerender-favorites-4k] Failed to create job:", jobError);
      } else {
        jobId = job?.id;
      }
    } else {
      console.log(`[rerender-favorites-4k] Resuming job ${jobId} with ${processedIds.size} already processed`);
    }

    // Filter out already processed favorites
    const remainingFavorites = favorites.filter(f => !processedIds.has(f.id));
    console.log(`[rerender-favorites-4k] ${remainingFavorites.length} favorites remaining to process`);

    // Self-continuation function
    const continueLater = async () => {
      console.log(`[rerender-favorites-4k] Timeout approaching, spawning new worker with ${processedIds.size} processed`);
      
      await supabase.functions.invoke("rerender-favorites-4k", {
        body: {
          batchId,
          lookIds,
          shotTypes,
          imageSize,
          resumeContext: {
            jobId,
            processedIds: Array.from(processedIds),
          } as ResumeContext,
        },
      });
    };

    // Process a single output with retry logic
    const processOutput = async (fav: typeof favorites[0], outputId: string): Promise<{ success: boolean; error?: string }> => {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          console.log(`[rerender-favorites-4k] Retry ${attempt}/${MAX_RETRIES} for output ${outputId}`);
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
        }

        try {
          const { error } = await supabase.functions.invoke("generate-repose-single", {
            body: { outputId, imageSize },
          });

          if (!error) {
            return { success: true };
          }

          const errorMsg = error?.message || String(error);
          
          // Retry on 503/504 errors
          if (errorMsg.includes('503') || errorMsg.includes('504') || errorMsg.includes('Gateway')) {
            console.log(`[rerender-favorites-4k] Transient error (${errorMsg}), will retry...`);
            continue;
          }

          // Non-retryable error
          return { success: false, error: errorMsg };
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          if (errorMsg.includes('503') || errorMsg.includes('504')) {
            continue;
          }
          return { success: false, error: errorMsg };
        }
      }

      return { success: false, error: "Max retries exceeded" };
    };

    // Background processing with all resilience patterns
    const processInBackground = async () => {
      const startTime = Date.now();
      let lastLogTime = startTime;
      let completed = processedIds.size;
      let failed = 0;

      // Get current job state if resuming
      if (isResume && jobId) {
        const { data: currentJob } = await supabase
          .from("pipeline_jobs")
          .select("progress_done, progress_failed")
          .eq("id", jobId)
          .single();
        
        if (currentJob) {
          completed = currentJob.progress_done || 0;
          failed = currentJob.progress_failed || 0;
        }
      }

      // Process in batches with concurrency control
      for (let i = 0; i < remainingFavorites.length; i += OUTPUT_CONCURRENCY) {
        // Check timeout before each batch
        if (Date.now() - startTime > MAX_PROCESSING_TIME_MS) {
          console.log(`[rerender-favorites-4k] Timeout approaching at ${i}/${remainingFavorites.length}`);
          await continueLater();
          return;
        }

        const batch = remainingFavorites.slice(i, i + OUTPUT_CONCURRENCY);
        console.log(`[rerender-favorites-4k] Processing batch ${i / OUTPUT_CONCURRENCY + 1}, items ${i + 1}-${i + batch.length} of ${remainingFavorites.length}`);

        // Process batch in parallel
        const batchPromises = batch.map(async (fav) => {
          try {
            // Create new output record with same pose
            const { data: newOutput, error: insertError } = await supabase
              .from("repose_outputs")
              .insert({
                batch_id: fav.batch_id,
                batch_item_id: fav.batch_item_id,
                pose_id: fav.pose_id,
                pose_url: fav.pose_url,
                shot_type: fav.shot_type,
                status: "running",
              })
              .select()
              .single();

            if (insertError || !newOutput) {
              console.error("[rerender-favorites-4k] Failed to create output:", insertError);
              return { favId: fav.id, success: false, error: insertError?.message };
            }

            // Generate with retry logic
            const result = await processOutput(fav, newOutput.id);

            if (!result.success) {
              // Mark output as failed with error message
              await supabase
                .from("repose_outputs")
                .update({ 
                  status: "failed",
                  error_message: result.error || "Unknown error"
                })
                .eq("id", newOutput.id);
            }

            return { favId: fav.id, outputId: newOutput.id, ...result };
          } catch (err) {
            console.error("[rerender-favorites-4k] Error processing favorite:", err);
            return { favId: fav.id, success: false, error: err instanceof Error ? err.message : String(err) };
          }
        });

        const results = await Promise.allSettled(batchPromises);

        // Update counts and track processed IDs
        for (const result of results) {
          if (result.status === 'fulfilled') {
            processedIds.add(result.value.favId);
            if (result.value.success) {
              completed++;
            } else {
              failed++;
              console.error(`[rerender-favorites-4k] Failed: ${result.value.error}`);
            }
          } else {
            failed++;
            console.error(`[rerender-favorites-4k] Promise rejected: ${result.reason}`);
          }
        }

        // Periodic heartbeat update
        if (jobId && (Date.now() - lastLogTime > LOG_INTERVAL_MS)) {
          await supabase
            .from("pipeline_jobs")
            .update({
              progress_done: completed,
              progress_failed: failed,
              updated_at: new Date().toISOString(),
            })
            .eq("id", jobId);
          lastLogTime = Date.now();
          console.log(`[rerender-favorites-4k] Heartbeat: ${completed} done, ${failed} failed of ${favorites.length}`);
        }
      }

      // Mark job as complete
      if (jobId) {
        const finalStatus = failed === favorites.length ? "FAILED" : "COMPLETED";
        await supabase
          .from("pipeline_jobs")
          .update({
            status: finalStatus,
            progress_done: completed,
            progress_failed: failed,
            completed_at: new Date().toISOString(),
          })
          .eq("id", jobId);
        console.log(`[rerender-favorites-4k] Job ${finalStatus}: ${completed} completed, ${failed} failed`);
      }
    };

    // Start background processing
    EdgeRuntime.waitUntil(processInBackground());

    return new Response(
      JSON.stringify({
        success: true,
        message: `${isResume ? 'Resumed' : 'Started'} re-rendering ${remainingFavorites.length} favorites at ${imageSize}`,
        count: remainingFavorites.length,
        totalFavorites: favorites.length,
        jobId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[rerender-favorites-4k] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
