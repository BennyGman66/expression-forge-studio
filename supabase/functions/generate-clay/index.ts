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

// Helper function to verify authentication
async function verifyAuth(req: Request): Promise<{ userId: string | null; error: Response | null }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      userId: null,
      error: new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const token = authHeader.replace('Bearer ', '');
  const { data, error } = await supabase.auth.getClaims(token);
  
  if (error || !data?.claims) {
    return {
      userId: null,
      error: new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    };
  }

  return { userId: data.claims.sub as string, error: null };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const { userId, error: authError } = await verifyAuth(req);
    if (authError) {
      return authError;
    }
    console.log(`Authenticated user: ${userId}`);

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
    return new Response(
      JSON.stringify({ error: "Service temporarily unavailable" }),
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
    console.error(`AI API error:`, response.status);
    
    if (response.status === 429) {
      throw new Error("RATE_LIMITED");
    }
    return null;
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.images?.[0]?.image_url?.url || null;
}

async function processImages(supabase: any, jobId: string, imageIds: string[], lovableApiKey: string, model: string) {
  console.log(`Processing ${imageIds.length} images for clay generation with model ${model}`);
  let processed = 0;
  const MAX_RETRIES = 2;

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

      let generatedImageUrl: string | null = null;
      let isValid = false;
      let attempts = 0;

      // Try to generate valid clay image with retries
      while (!isValid && attempts < MAX_RETRIES) {
        attempts++;
        const useReinforced = attempts > 1;
        
        console.log(`[${imageId}] Generation attempt ${attempts}/${MAX_RETRIES} (reinforced: ${useReinforced})`);
        
        try {
          generatedImageUrl = await generateClayImage(imageUrl, lovableApiKey, model, useReinforced);
          
          if (!generatedImageUrl) {
            console.error(`[${imageId}] No image returned on attempt ${attempts}`);
            continue;
          }

          // Validate the generated image
          console.log(`[${imageId}] Validating generated image...`);
          isValid = await validateClayImage(generatedImageUrl, lovableApiKey);
          
          if (!isValid) {
            console.log(`[${imageId}] Validation failed, will retry with reinforced prompt`);
          }
        } catch (error: any) {
          if (error.message === "RATE_LIMITED") {
            console.log("Rate limited, waiting 30 seconds...");
            await new Promise((r) => setTimeout(r, 30000));
            attempts--; // Don't count rate limit as an attempt
          } else {
            throw error;
          }
        }
      }

      if (!generatedImageUrl) {
        console.error(`[${imageId}] Failed to generate clay image after ${MAX_RETRIES} attempts`);
        processed++;
        await updateJobProgress(supabase, jobId, processed, imageIds.length);
        continue;
      }

      // Upload to Supabase storage (even if validation failed, save what we have)
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

      // Save to clay_images table using upsert to prevent duplicates
      const { error: upsertError } = await supabase
        .from("clay_images")
        .upsert({
          product_image_id: imageId,
          stored_url: publicUrl,
        }, { onConflict: 'product_image_id' });

      if (upsertError) {
        console.error(`Upsert error for ${imageId}:`, upsertError);
        processed++;
        await updateJobProgress(supabase, jobId, processed, imageIds.length);
        continue;
      }

      console.log(`[${imageId}] Successfully generated clay (valid: ${isValid})`);
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
