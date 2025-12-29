import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLAY_PROMPT = `Convert this photo into a stylised 3D clay model render. Grey matte material, subtle polygonal mesh shading, simplified anatomy, smooth sculpted surfaces. Neutral studio lighting, no background texture. Replicate the exact pose and body orientation from the reference image. Maintain the proportions and overall silhouette exactly as in the original photo.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { brandId, imageIds, model } = await req.json();
    const selectedModel = model || "google/gemini-2.5-flash-image-preview";

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

    // Create a job entry for tracking progress
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        brand_id: brandId,
        type: "clay_generation",
        status: "processing",
        progress: 0,
        total: imageIds.length,
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

    console.log(`Created job ${job.id} for ${imageIds.length} images using model ${selectedModel}`);

    // Process images in background
    (globalThis as any).EdgeRuntime?.waitUntil?.(processImages(supabase, job.id, imageIds, lovableApiKey, selectedModel)) 
      ?? processImages(supabase, job.id, imageIds, lovableApiKey, selectedModel);

    return new Response(
      JSON.stringify({ 
        success: true, 
        jobId: job.id,
        total: imageIds.length,
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

async function processImages(supabase: any, jobId: string, imageIds: string[], lovableApiKey: string, model: string) {
  console.log(`Processing ${imageIds.length} images for clay generation with model ${model}`);
  let processed = 0;

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
        processed++;
        await updateJobProgress(supabase, jobId, processed, imageIds.length);
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
        processed++;
        await updateJobProgress(supabase, jobId, processed, imageIds.length);
        continue;
      }

      const imageUrl = productImage.stored_url || productImage.source_url;
      if (!imageUrl) {
        console.error(`No image URL for ${imageId}`);
        processed++;
        await updateJobProgress(supabase, jobId, processed, imageIds.length);
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
          model: model,
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
        processed++;
        await updateJobProgress(supabase, jobId, processed, imageIds.length);
        continue;
      }

      const data = await response.json();
      const generatedImageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

      if (!generatedImageUrl) {
        console.error(`No image returned for ${imageId}`);
        processed++;
        await updateJobProgress(supabase, jobId, processed, imageIds.length);
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
        processed++;
        await updateJobProgress(supabase, jobId, processed, imageIds.length);
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
        processed++;
        await updateJobProgress(supabase, jobId, processed, imageIds.length);
        continue;
      }

      console.log(`Successfully generated clay for ${imageId}`);
      processed++;
      await updateJobProgress(supabase, jobId, processed, imageIds.length);

      // Small delay between requests to avoid rate limiting
      await new Promise((r) => setTimeout(r, 2000));
    } catch (error) {
      console.error(`Error processing ${imageId}:`, error);
      processed++;
      await updateJobProgress(supabase, jobId, processed, imageIds.length);
    }
  }

  // Mark job as completed
  await supabase
    .from("jobs")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", jobId);

  console.log("Clay generation complete");
}

async function updateJobProgress(supabase: any, jobId: string, progress: number, total: number) {
  await supabase
    .from("jobs")
    .update({ progress, total, updated_at: new Date().toISOString() })
    .eq("id", jobId);
}
