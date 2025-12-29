import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLAY_PROMPT = `Convert this photo into a pose-only stylised 3D clay reference model.

Material & surface:
- Uniform grey matte clay material
- No fabric texture, no seams, no folds, no stitching
- No hair strands, no hairstyle detail
- No facial features (no eyes, nose, mouth, ears)
- No fingernail, jewelry, or accessory detail

Geometry & anatomy:
- Preserve exact body pose, limb angles, weight distribution, and balance
- Maintain overall proportions and silhouette only
- Simplify anatomy into smooth sculpted forms
- Arms, legs, torso, and head should be clearly readable as volumes, not detailed anatomy
- Fingers may be merged or simplified into a single block shape

Head & identity neutralization:
- Head should be a smooth, featureless form
- No face, no hair volume, no gender markers
- No identifiable human features

Clothing abstraction:
- Remove all clothing detail
- Represent clothing only as very subtle volume separation if needed to distinguish top vs bottom
- No collars, buttons, pockets, hems, or footwear detail
- Shoes should be simplified into smooth block forms

Lighting & environment:
- Neutral studio lighting
- Soft, even illumination
- No shadows that reveal surface detail
- Plain neutral background, no texture

Output intent:
- The result should function as a pose reference only
- The model should look like a generic clay mannequin
- No indication of the person's identity, hairstyle, clothing style, or facial structure
- The image should communicate pose and posture clearly, nothing else`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { brandId, imageIds } = await req.json();

    if (!brandId || !imageIds || imageIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "brandId and imageIds are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Process images in background
    (globalThis as any).EdgeRuntime?.waitUntil?.(processImages(supabase, imageIds, lovableApiKey)) 
      ?? processImages(supabase, imageIds, lovableApiKey);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Started clay generation for ${imageIds.length} images` 
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

async function processImages(supabase: any, imageIds: string[], lovableApiKey: string) {
  console.log(`Processing ${imageIds.length} images for clay generation`);

  for (let i = 0; i < imageIds.length; i++) {
    const imageId = imageIds[i];
    console.log(`[${i + 1}/${imageIds.length}] Processing image ${imageId}`);

    try {
      // Get the product image
      const { data: productImage, error: fetchError } = await supabase
        .from("product_images")
        .select("*")
        .eq("id", imageId)
        .single();

      if (fetchError || !productImage) {
        console.error(`Failed to fetch image ${imageId}:`, fetchError);
        continue;
      }

      // Check if clay image already exists
      const { data: existingClay } = await supabase
        .from("clay_images")
        .select("id")
        .eq("product_image_id", imageId)
        .single();

      if (existingClay) {
        console.log(`Clay image already exists for ${imageId}, skipping`);
        continue;
      }

      const imageUrl = productImage.stored_url || productImage.source_url;
      if (!imageUrl) {
        console.error(`No image URL for ${imageId}`);
        continue;
      }

      // Generate clay image using Lovable AI (Nano banana model)
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image-preview",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: CLAY_PROMPT,
                },
                {
                  type: "image_url",
                  image_url: {
                    url: imageUrl,
                  },
                },
              ],
            },
          ],
          modalities: ["image", "text"],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`AI API error for ${imageId}:`, response.status, errorText);
        
        if (response.status === 429) {
          console.log("Rate limited, waiting 30 seconds...");
          await new Promise((r) => setTimeout(r, 30000));
          i--; // Retry this image
          continue;
        }
        continue;
      }

      const data = await response.json();
      const generatedImageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

      if (!generatedImageUrl) {
        console.error(`No image returned for ${imageId}`);
        continue;
      }

      // Upload to Supabase storage
      const base64Data = generatedImageUrl.replace(/^data:image\/\w+;base64,/, "");
      const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
      
      const fileName = `clay/${imageId}_${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage
        .from("images")
        .upload(fileName, binaryData, {
          contentType: "image/png",
          upsert: true,
        });

      if (uploadError) {
        console.error(`Upload error for ${imageId}:`, uploadError);
        continue;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("images")
        .getPublicUrl(fileName);

      // Save to clay_images table
      const { error: insertError } = await supabase
        .from("clay_images")
        .insert({
          product_image_id: imageId,
          stored_url: publicUrl,
        });

      if (insertError) {
        console.error(`Insert error for ${imageId}:`, insertError);
        continue;
      }

      console.log(`Successfully generated clay for ${imageId}`);

      // Small delay between requests to avoid rate limiting
      await new Promise((r) => setTimeout(r, 2000));
    } catch (error) {
      console.error(`Error processing ${imageId}:`, error);
    }
  }

  console.log("Clay generation complete");
}
