import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface ImageToClassify {
  id: string;
  stored_url: string;
  current_slot: string;
}

async function classifyImage(imageUrl: string): Promise<string> {
  const prompt = `Analyze this fashion/clothing product image and classify it into ONE of these categories:

A - FULL FRONT: A full body shot showing the entire person from head to toe, facing the camera (front view). The whole body must be visible.

B - CROPPED FRONT: A cropped shot showing either just the top half (waist up) OR just the bottom half (waist down) of the body, facing forward. NOT a full body shot.

D - DETAIL: An extreme close-up shot focusing on specific details like the face, fabric texture, a logo, buttons, collar, or other small product details. Very zoomed in.

C - FULL BACK: A full body shot showing the entire person from head to toe, but from BEHIND (back view). The whole body must be visible.

Respond with ONLY the single letter (A, B, C, or D) that best matches this image. Nothing else.`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageUrl } }
            ]
          }
        ],
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AI API error: ${response.status} - ${errorText}`);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const classification = data.choices?.[0]?.message?.content?.trim()?.toUpperCase() || "";
    
    // Validate the response is a valid slot
    if (["A", "B", "C", "D"].includes(classification)) {
      return classification;
    }
    
    // Try to extract just the letter if there's extra text
    const match = classification.match(/^[ABCD]/);
    if (match) {
      return match[0];
    }
    
    console.log(`Invalid classification response: "${classification}", defaulting to A`);
    return "A";
  } catch (error) {
    console.error(`Error classifying image: ${error}`);
    throw error;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { brandId, imageIds } = await req.json();

    if (!brandId) {
      return new Response(
        JSON.stringify({ error: "brandId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get all product images for this brand that need organizing
    let query = supabase
      .from("product_images")
      .select("id, stored_url, slot, products!inner(brand_id)")
      .eq("products.brand_id", brandId)
      .not("stored_url", "is", null);

    if (imageIds && imageIds.length > 0) {
      query = query.in("id", imageIds);
    }

    const { data: images, error: fetchError } = await query;

    if (fetchError) {
      console.error("Error fetching images:", fetchError);
      throw fetchError;
    }

    if (!images || images.length === 0) {
      return new Response(
        JSON.stringify({ message: "No images to organize", updated: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Starting organization of ${images.length} images`);

    let updated = 0;
    const results: { id: string; oldSlot: string; newSlot: string }[] = [];

    // Process images with rate limiting
    for (const image of images) {
      try {
        const newSlot = await classifyImage(image.stored_url);
        
        if (newSlot !== image.slot) {
          const { error: updateError } = await supabase
            .from("product_images")
            .update({ slot: newSlot })
            .eq("id", image.id);

          if (updateError) {
            console.error(`Error updating image ${image.id}:`, updateError);
          } else {
            updated++;
            results.push({ id: image.id, oldSlot: image.slot, newSlot });
            console.log(`Image ${image.id}: ${image.slot} -> ${newSlot}`);
          }
        } else {
          console.log(`Image ${image.id}: already in correct slot ${image.slot}`);
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`Failed to classify image ${image.id}:`, error);
      }
    }

    console.log(`Organization complete. Updated ${updated} of ${images.length} images`);

    return new Response(
      JSON.stringify({ 
        message: "Organization complete",
        total: images.length,
        updated,
        results 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("organize-images error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
