import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLAY_PROMPT = `Convert this photo into a stylised 3D clay model render. Grey matte material, subtle polygonal mesh shading, simplified anatomy, smooth sculpted surfaces. Neutral studio lighting, no background texture. Replicate the exact pose and body orientation from the reference image. Maintain the proportions and overall silhouette exactly as in the original photo.`;

const REINFORCED_CLAY_PROMPT = `CRITICAL: Convert this photo into a COMPLETELY GREY 3D clay model render. 

MANDATORY REQUIREMENTS:
- The ENTIRE image must be in shades of GREY ONLY - no colors whatsoever
- Grey matte clay material throughout
- NO skin tones, NO colored clothing, NO colored backgrounds
- Everything must look like a grey clay/plaster sculpture
- Subtle polygonal mesh shading
- Simplified anatomy with smooth sculpted surfaces
- Neutral studio lighting on plain grey/white background

The final image should look like a monochrome grey clay sculpture - absolutely NO colors from the original photo should remain. Replicate the exact pose and body orientation only.`;

const VALIDATION_PROMPT = `Analyze this image and determine if it is a proper grey clay model render.

A VALID grey clay render must:
- Be entirely in shades of grey (monochrome)
- Look like a 3D clay or plaster sculpture
- Have NO colored clothing, skin tones, or colored elements
- Have a neutral grey/white background

Respond with ONLY "VALID" or "INVALID" followed by a brief reason.
Example: "VALID - Image is a monochrome grey clay sculpture"
Example: "INVALID - Image contains colored clothing and skin tones"`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageId, model, jobId } = await req.json();
    const selectedModel = model || "google/gemini-2.5-flash-image-preview";

    if (!imageId) {
      return new Response(
        JSON.stringify({ error: "imageId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[${imageId}] Starting clay generation with model ${selectedModel}`);

    // Get the product image
    const { data: productImage, error: fetchError } = await supabase
      .from("product_images")
      .select("*")
      .eq("id", imageId)
      .single();

    if (fetchError || !productImage) {
      console.error(`[${imageId}] Failed to fetch image:`, fetchError);
      return new Response(
        JSON.stringify({ error: "Image not found", imageId }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if clay image already exists
    const { data: existingClay } = await supabase
      .from("clay_images")
      .select("id, stored_url")
      .eq("product_image_id", imageId)
      .single();

    if (existingClay) {
      console.log(`[${imageId}] Clay already exists, skipping`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          imageId, 
          skipped: true,
          storedUrl: existingClay.stored_url 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const imageUrl = productImage.stored_url || productImage.source_url;
    if (!imageUrl) {
      console.error(`[${imageId}] No image URL`);
      return new Response(
        JSON.stringify({ error: "No image URL", imageId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const MAX_RETRIES = 2;
    let generatedImageUrl: string | null = null;
    let isValid = false;

    // Try to generate valid clay image with retries
    for (let attempt = 1; attempt <= MAX_RETRIES && !isValid; attempt++) {
      const useReinforced = attempt > 1;
      console.log(`[${imageId}] Attempt ${attempt}/${MAX_RETRIES} (reinforced: ${useReinforced})`);

      try {
        generatedImageUrl = await generateClayImage(imageUrl, lovableApiKey, selectedModel, useReinforced);

        if (!generatedImageUrl) {
          console.error(`[${imageId}] No image returned on attempt ${attempt}`);
          continue;
        }

        // Validate the generated image
        console.log(`[${imageId}] Validating generated image...`);
        isValid = await validateClayImage(generatedImageUrl, lovableApiKey);

        if (!isValid) {
          console.log(`[${imageId}] Validation failed, will retry`);
        }
      } catch (error: any) {
        if (error.message === "RATE_LIMITED") {
          console.log(`[${imageId}] Rate limited, waiting 10s...`);
          await new Promise((r) => setTimeout(r, 10000));
          attempt--; // Don't count rate limit as an attempt
        } else {
          console.error(`[${imageId}] Generation error:`, error);
          throw error;
        }
      }
    }

    if (!generatedImageUrl) {
      console.error(`[${imageId}] Failed to generate clay after ${MAX_RETRIES} attempts`);
      return new Response(
        JSON.stringify({ error: "Generation failed", imageId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
      console.error(`[${imageId}] Upload error:`, uploadError);
      return new Response(
        JSON.stringify({ error: "Upload failed", imageId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from("images")
      .getPublicUrl(fileName);

    // Save to clay_images table
    const { error: insertError } = await supabase
      .from("clay_images")
      .upsert({
        product_image_id: imageId,
        stored_url: publicUrl,
      }, { onConflict: 'product_image_id' });

    if (insertError) {
      console.error(`[${imageId}] Insert error:`, insertError);
      return new Response(
        JSON.stringify({ error: "Database insert failed", imageId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update job progress if jobId provided
    if (jobId) {
      const { data: job } = await supabase
        .from("jobs")
        .select("progress")
        .eq("id", jobId)
        .single();

      if (job) {
        await supabase
          .from("jobs")
          .update({ 
            progress: (job.progress || 0) + 1,
            updated_at: new Date().toISOString()
          })
          .eq("id", jobId);
      }
    }

    console.log(`[${imageId}] Successfully generated clay (valid: ${isValid})`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        imageId, 
        storedUrl: publicUrl,
        isValid 
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

async function validateClayImage(imageUrl: string, lovableApiKey: string): Promise<boolean> {
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
              { type: "text", text: VALIDATION_PROMPT },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("Validation API error:", response.status);
      return true; // Assume valid if validation fails
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content || "";
    console.log(`Validation result: ${result}`);

    return result.toUpperCase().startsWith("VALID");
  } catch (error) {
    console.error("Validation error:", error);
    return true; // Assume valid if validation fails
  }
}

async function generateClayImage(imageUrl: string, lovableApiKey: string, model: string, useReinforced: boolean): Promise<string | null> {
  const prompt = useReinforced ? REINFORCED_CLAY_PROMPT : CLAY_PROMPT;

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
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      modalities: ["image", "text"],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`AI API error:`, response.status, errorText);

    if (response.status === 429) {
      throw new Error("RATE_LIMITED");
    }
    return null;
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.images?.[0]?.image_url?.url || null;
}
