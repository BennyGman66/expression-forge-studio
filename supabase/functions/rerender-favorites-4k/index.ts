import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * This function queues 4K re-renders by:
 * 1. Finding all favorite outputs that need 4K re-rendering
 * 2. Creating new output records with status 'queued'
 * 3. Creating a pipeline_job to track progress
 * 4. Invoking process-repose-queue-4k to handle the actual generation in background
 * 
 * This avoids timeout issues by NOT waiting for generation to complete.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { batchId, lookIds, shotTypes, imageSize = "4K" } = await req.json();

    if (!batchId) {
      return new Response(
        JSON.stringify({ error: "batchId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[rerender-favorites-4k] Starting for batch ${batchId}, imageSize: ${imageSize}`);
    console.log(`[rerender-favorites-4k] lookIds: ${lookIds?.length || 'all'}, shotTypes: ${shotTypes?.join(',') || 'all'}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get batch info
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
      .eq("status", "complete")
      .not("result_url", "is", null);

    // Filter by look IDs if provided
    if (lookIds && lookIds.length > 0) {
      const { data: batchItems } = await supabase
        .from("repose_batch_items")
        .select("id")
        .eq("batch_id", batchId)
        .in("look_id", lookIds);

      if (batchItems && batchItems.length > 0) {
        const batchItemIds = batchItems.map((bi: any) => bi.id);
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

    // Create a pipeline job to track this 4K rendering batch (use REPOSE_GENERATION type)
    const { data: job, error: jobError } = await supabase
      .from("pipeline_jobs")
      .insert({
        type: "REPOSE_GENERATION",
        title: `Re-render ${favorites.length} favorites @ ${imageSize}`,
        status: "RUNNING",
        origin_route: `/repose-production/batch/${batchId}?tab=4k-edit`,
        origin_context: {
          batchId,
          imageSize,
          shotTypes: shotTypes || [],
          lookIds: lookIds || [],
          isRerender: true,
          is4K: true,
        },
        progress_done: 0,
        progress_failed: 0,
        progress_total: favorites.length,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (jobError) {
      console.error("[rerender-favorites-4k] Error creating job:", jobError);
      throw jobError;
    }

    console.log(`[rerender-favorites-4k] Created pipeline job ${job.id}`);

    // Create new output records for 4K versions (separate from originals)
    const outputsToCreate = favorites.map((fav: any) => ({
      batch_id: batchId,
      batch_item_id: fav.batch_item_id,
      pose_id: fav.pose_id,
      pose_url: fav.pose_url,
      shot_type: fav.shot_type,
      attempt_index: 0,
      status: "queued",
      is_favorite: false, // New outputs start without favorite status
    }));

    const { data: createdOutputs, error: insertError } = await supabase
      .from("repose_outputs")
      .insert(outputsToCreate)
      .select("id");

    if (insertError) {
      console.error("[rerender-favorites-4k] Error creating outputs:", insertError);
      await supabase
        .from("pipeline_jobs")
        .update({ status: "FAILED", progress_message: insertError.message })
        .eq("id", job.id);
      throw insertError;
    }

    const outputIds = createdOutputs?.map((o: any) => o.id) || [];
    console.log(`[rerender-favorites-4k] Created ${outputIds.length} queued outputs`);

    // Now invoke the 4K queue processor (fire and forget - it runs in background)
    const invokeResponse = await fetch(`${supabaseUrl}/functions/v1/process-repose-queue-4k`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        batchId,
        pipelineJobId: job.id,
        imageSize,
        outputIds,
      }),
    });

    if (!invokeResponse.ok) {
      console.error("[rerender-favorites-4k] Error invoking queue processor:", await invokeResponse.text());
      // Don't fail - the outputs are queued and can be picked up later
    } else {
      console.log("[rerender-favorites-4k] Queue processor invoked successfully");
    }

    return new Response(
      JSON.stringify({
        success: true,
        jobId: job.id,
        queuedCount: outputIds.length,
        message: `Queued ${outputIds.length} outputs for ${imageSize} re-rendering`,
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
