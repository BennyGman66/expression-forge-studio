import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLASSIFICATION_PROMPT = `Analyze this grey clay model image and determine which pose slot it belongs to.

SLOT DEFINITIONS:
- A (Full Front): Full body visible from head to feet, front-facing view
- B (Cropped Front): Upper body only (waist/hip up), front-facing, legs NOT visible
- C (Full Back): Full body visible from head to feet, back view
- D (Detail): Close-up detail shot, typically showing specific body parts or tight crop

ANALYSIS CRITERIA:
1. Can you see the full body from head to feet? If YES → A or C
2. Is it a front view or back view?
   - Front (face visible) → A if full body, B if cropped
   - Back (back of head visible) → C
3. Is it cropped at waist/hip level showing only upper body? → B
4. Is it a close-up or very tight crop of specific area? → D

Respond with ONLY a single letter: A, B, C, or D
Do not include any explanation.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { brandId } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch clay images with their current slots
    let query = supabase
      .from("clay_images")
      .select(`
        id,
        stored_url,
        product_image_id,
        product_images!inner (
          id,
          slot,
          products!inner (
            brand_id
          )
        )
      `);

    if (brandId) {
      query = query.eq("product_images.products.brand_id", brandId);
    }

    const { data: clayImages, error: fetchError } = await query;

    if (fetchError) {
      console.error("Failed to fetch clay images:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch clay images" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!clayImages || clayImages.length === 0) {
      return new Response(
        JSON.stringify({ success: true, total: 0, message: "No clay images to check" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create a job entry for tracking progress
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        brand_id: brandId,
        type: "clay_pose_check",
        status: "processing",
        progress: 0,
        total: clayImages.length,
      })
      .select()
      .single();

    if (jobError) {
      console.error("Failed to create job:", jobError);
      return new Response(
        JSON.stringify({ error: "Failed to create job" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Created job ${job.id} for checking ${clayImages.length} clay poses`);

    // Process in background
    (globalThis as any).EdgeRuntime?.waitUntil?.(processClayPoses(supabase, job.id, clayImages, lovableApiKey)) 
      ?? processClayPoses(supabase, job.id, clayImages, lovableApiKey);

    return new Response(
      JSON.stringify({ 
        success: true, 
        jobId: job.id,
        total: clayImages.length,
        message: `Started checking ${clayImages.length} clay poses` 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function classifyPoseSlot(imageUrl: string, lovableApiKey: string): Promise<string | null> {
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: CLASSIFICATION_PROMPT },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("Classification API error:", response.status);
      return null;
    }

    const data = await response.json();
    const result = (data.choices?.[0]?.message?.content || "").trim().toUpperCase();
    
    // Validate the result is a valid slot
    if (["A", "B", "C", "D"].includes(result)) {
      return result;
    }
    
    // Try to extract from longer response
    const match = result.match(/^([ABCD])/);
    return match ? match[1] : null;
  } catch (error) {
    console.error("Classification error:", error);
    return null;
  }
}

async function processClayPoses(supabase: any, jobId: string, clayImages: any[], lovableApiKey: string) {
  console.log(`Processing ${clayImages.length} clay poses for slot verification`);
  let processed = 0;
  let movedCount = 0;
  let flaggedCount = 0;

  for (let i = 0; i < clayImages.length; i++) {
    const clay = clayImages[i];
    const currentSlot = clay.product_images?.slot;
    const productImageId = clay.product_images?.id;

    console.log(`[${i + 1}/${clayImages.length}] Checking clay pose ${clay.id}, current slot: ${currentSlot}`);

    try {
      const suggestedSlot = await classifyPoseSlot(clay.stored_url, lovableApiKey);
      
      if (suggestedSlot && suggestedSlot !== currentSlot) {
        console.log(`[${clay.id}] Slot mismatch: current=${currentSlot}, suggested=${suggestedSlot}`);
        
        // Auto-move to correct slot
        const { error: updateError } = await supabase
          .from("product_images")
          .update({ slot: suggestedSlot })
          .eq("id", productImageId);

        if (updateError) {
          console.error(`Failed to update slot for ${productImageId}:`, updateError);
          flaggedCount++;
        } else {
          console.log(`[${clay.id}] Moved from ${currentSlot} to ${suggestedSlot}`);
          movedCount++;
        }
      }

      processed++;
      await updateJobProgress(supabase, jobId, processed, clayImages.length);

      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 500));
    } catch (error) {
      console.error(`Error processing ${clay.id}:`, error);
      processed++;
      await updateJobProgress(supabase, jobId, processed, clayImages.length);
    }
  }

  // Mark job as completed with results
  await supabase
    .from("jobs")
    .update({ 
      status: "completed", 
      result: { moved: movedCount, flagged: flaggedCount },
      updated_at: new Date().toISOString() 
    })
    .eq("id", jobId);

  console.log(`Clay pose check complete. Moved: ${movedCount}, Flagged: ${flaggedCount}`);
}

async function updateJobProgress(supabase: any, jobId: string, progress: number, total: number) {
  await supabase
    .from("jobs")
    .update({ progress, total, updated_at: new Date().toISOString() })
    .eq("id", jobId);
}
