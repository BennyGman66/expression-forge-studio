import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { batchId, lookIds, imageSize = "4K" } = await req.json();

    if (!batchId) {
      return new Response(
        JSON.stringify({ error: "batchId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[rerender-favorites-4k] Starting for batch ${batchId}, ${lookIds?.length || 'all'} looks, size: ${imageSize}`);

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
      // Get batch item IDs for the specified looks
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

    // Create a pipeline job for tracking
    const { data: job, error: jobError } = await supabase
      .from("pipeline_jobs")
      .insert({
        type: "REPOSE_GENERATION",
        title: `Re-render ${favorites.length} favorites @ ${imageSize}`,
        status: "RUNNING",
        origin_route: `/repose-production/batch/${batchId}`,
        origin_context: {
          batchId,
          isRerender: true,
          imageSize,
          favoriteCount: favorites.length,
        },
        progress_complete: 0,
        progress_running: favorites.length,
        progress_queued: 0,
        progress_failed: 0,
        progress_total: favorites.length,
      })
      .select()
      .single();

    if (jobError) {
      console.error("[rerender-favorites-4k] Failed to create job:", jobError);
    }

    // Process favorites in the background
    const processInBackground = async () => {
      let completed = 0;
      let failed = 0;

      for (const fav of favorites) {
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
            failed++;
            continue;
          }

          // Invoke generation with specified image size
          const { error: invokeError } = await supabase.functions.invoke("generate-repose-single", {
            body: { 
              outputId: newOutput.id, 
              imageSize: imageSize 
            },
          });

          if (invokeError) {
            console.error("[rerender-favorites-4k] Generation failed:", invokeError);
            failed++;
            // Mark output as failed
            await supabase
              .from("repose_outputs")
              .update({ status: "failed" })
              .eq("id", newOutput.id);
          } else {
            completed++;
          }

          // Update job progress
          if (job) {
            await supabase
              .from("pipeline_jobs")
              .update({
                progress_complete: completed,
                progress_failed: failed,
                progress_running: favorites.length - completed - failed,
              })
              .eq("id", job.id);
          }
        } catch (err) {
          console.error("[rerender-favorites-4k] Error processing favorite:", err);
          failed++;
        }
      }

      // Mark job as complete
      if (job) {
        await supabase
          .from("pipeline_jobs")
          .update({
            status: failed === favorites.length ? "FAILED" : "COMPLETED",
            progress_complete: completed,
            progress_failed: failed,
            progress_running: 0,
          })
          .eq("id", job.id);
      }

      console.log(`[rerender-favorites-4k] Finished: ${completed} completed, ${failed} failed`);
    };

    // Start background processing
    EdgeRuntime.waitUntil(processInBackground());

    return new Response(
      JSON.stringify({
        success: true,
        message: `Started re-rendering ${favorites.length} favorites at ${imageSize}`,
        count: favorites.length,
        jobId: job?.id,
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
