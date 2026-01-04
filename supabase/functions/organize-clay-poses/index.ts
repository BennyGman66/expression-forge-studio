import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLASSIFICATION_PROMPT = `Analyze this product/fashion image and classify it.

FIRST, determine if this image should be DELETED:
- Is this a photo of a CHILD (anyone who appears under 18)? → DELETE
- Is this a PRODUCT-ONLY shot with NO PERSON visible (flat lay, just clothing/accessories on a surface or mannequin)? → DELETE

IF the image should be kept (adult model visible), classify into the correct SLOT:
- A (Full Front): Full body visible from head to at least mid-thigh/knees, FRONT-facing view (face visible)
- B (Cropped Front): Upper body only (waist up), FRONT-facing, legs NOT fully visible, OR 3/4 angle views
- C (Full Back): Full body visible from head to at least mid-thigh/knees, BACK view (back of head visible)
- D (Detail): Close-up/detail shot, OR side profile, OR very tight crop showing specific body parts

RESPONSE FORMAT (exactly one of):
DELETE_CHILD - if showing a child/minor
DELETE_PRODUCT - if product-only with no person
A - Full front body shot
B - Cropped front / upper body
C - Full back body shot
D - Detail / close-up / side profile

Respond with ONLY the classification code, nothing else.`;

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

    // Fetch product images (not clay) for the brand
    let query = supabase
      .from("product_images")
      .select(`
        id,
        source_url,
        stored_url,
        slot,
        products!inner (
          id,
          brand_id
        )
      `);

    if (brandId) {
      query = query.eq("products.brand_id", brandId);
    }

    const { data: productImages, error: fetchError } = await query;

    if (fetchError) {
      console.error("Failed to fetch product images:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch product images" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!productImages || productImages.length === 0) {
      return new Response(
        JSON.stringify({ success: true, total: 0, message: "No images to organize" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create a job entry for tracking progress
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        brand_id: brandId,
        type: "ava_organize",
        status: "processing",
        progress: 0,
        total: productImages.length,
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

    console.log(`Created job ${job.id} for organizing ${productImages.length} images`);

    // Process in background
    (globalThis as any).EdgeRuntime?.waitUntil?.(processImages(supabase, job.id, productImages, lovableApiKey)) 
      ?? processImages(supabase, job.id, productImages, lovableApiKey);

    return new Response(
      JSON.stringify({ 
        success: true, 
        jobId: job.id,
        total: productImages.length,
        message: `Started organizing ${productImages.length} images` 
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

async function classifyImage(imageUrl: string, lovableApiKey: string): Promise<string | null> {
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
    
    // Check for valid responses
    if (["A", "B", "C", "D", "DELETE_CHILD", "DELETE_PRODUCT"].includes(result)) {
      return result;
    }
    
    // Try to extract from longer response
    if (result.includes("DELETE_CHILD")) return "DELETE_CHILD";
    if (result.includes("DELETE_PRODUCT")) return "DELETE_PRODUCT";
    
    const match = result.match(/^([ABCD])/);
    return match ? match[1] : null;
  } catch (error) {
    console.error("Classification error:", error);
    return null;
  }
}

async function processImages(supabase: any, jobId: string, images: any[], lovableApiKey: string) {
  console.log(`Processing ${images.length} images for AVA organize`);
  let processed = 0;
  let movedCount = 0;
  let deletedCount = 0;
  let keptCount = 0;

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const imageUrl = img.stored_url || img.source_url;
    const currentSlot = img.slot;

    console.log(`[${i + 1}/${images.length}] Analyzing image ${img.id}, current slot: ${currentSlot}`);

    try {
      const classification = await classifyImage(imageUrl, lovableApiKey);
      
      if (!classification) {
        console.log(`[${img.id}] Could not classify, keeping as-is`);
        keptCount++;
      } else if (classification.startsWith("DELETE")) {
        const reason = classification === "DELETE_CHILD" ? "child photo" : "product-only";
        console.log(`[${img.id}] Deleting: ${reason}`);
        
        // Delete associated clay image first
        await supabase.from("clay_images").delete().eq("product_image_id", img.id);
        // Delete the product image
        await supabase.from("product_images").delete().eq("id", img.id);
        deletedCount++;
      } else if (classification !== currentSlot) {
        console.log(`[${img.id}] Moving from ${currentSlot} to ${classification}`);
        
        const { error: updateError } = await supabase
          .from("product_images")
          .update({ slot: classification })
          .eq("id", img.id);

        if (updateError) {
          console.error(`Failed to update slot for ${img.id}:`, updateError);
        } else {
          movedCount++;
        }
      } else {
        console.log(`[${img.id}] Already correct slot: ${currentSlot}`);
        keptCount++;
      }

      processed++;
      await updateJobProgress(supabase, jobId, processed, images.length);

      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 300));
    } catch (error) {
      console.error(`Error processing ${img.id}:`, error);
      processed++;
      await updateJobProgress(supabase, jobId, processed, images.length);
    }
  }

  // Mark job as completed with results
  await supabase
    .from("jobs")
    .update({ 
      status: "completed", 
      result: { moved: movedCount, deleted: deletedCount, kept: keptCount },
      updated_at: new Date().toISOString() 
    })
    .eq("id", jobId);

  console.log(`AVA organize complete. Moved: ${movedCount}, Deleted: ${deletedCount}, Kept: ${keptCount}`);
}

async function updateJobProgress(supabase: any, jobId: string, progress: number, total: number) {
  await supabase
    .from("jobs")
    .update({ progress, total, updated_at: new Date().toISOString() })
    .eq("id", jobId);
}
