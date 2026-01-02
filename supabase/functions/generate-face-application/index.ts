import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STUDIO_LIGHTING_PROMPT = `Keep face and lighting consistent from image 1.

Model photographed in soft, high-key studio lighting against a clean white background with no visible texture. A large, diffused key light is positioned near-frontal and slightly offset to camera-left (approx. 15–25°), placed just above eye level and angled gently downward. The key light is broad and wrapping, allowing light to softly spill across the far cheek and temple, creating a faint but visible highlight on the camera-left side of the face rather than full shadow. This produces even illumination with soft gradients and minimal shadows under the nose. Diffused frontal fill and ambient studio bounce ensure the far side of the face remains gently lifted with a smooth tonal gradient, not falling into darkness. No rim light, no backlight, no harsh contrast. Skin appears matte and natural with preserved texture. Overall look is crisp, neutral, modern, and consistent with premium fashion e-commerce photography. Colours are true-to-life with restrained contrast.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { jobId, outfitDescriptions, faceMatches } = await req.json();

    console.log(`Starting face application job: ${jobId}`);

    // Initialize clients
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Update job status
    await supabase
      .from("face_application_jobs")
      .update({ status: "running" })
      .eq("id", jobId);

    // Get job details
    const { data: job } = await supabase
      .from("face_application_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (!job) {
      throw new Error("Job not found");
    }

    // Get source images for this look
    const { data: sourceImages } = await supabase
      .from("look_source_images")
      .select("*")
      .eq("look_id", job.look_id)
      .not("head_cropped_url", "is", null);

    if (!sourceImages || sourceImages.length === 0) {
      throw new Error("No source images found");
    }

    console.log(`Processing ${sourceImages.length} source images with ${job.attempts_per_view} attempts each`);

    // Process in background using setTimeout (Deno pattern)
    setTimeout(() => {
      processGeneration(supabase, job, sourceImages, outfitDescriptions, faceMatches, LOVABLE_API_KEY);
    }, 0);

    return new Response(
      JSON.stringify({ success: true, message: "Generation started" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in generate-face-application:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function processGeneration(
  supabase: any,
  job: any,
  sourceImages: any[],
  outfitDescriptions: Record<string, string>,
  faceMatches: Record<string, string>,
  apiKey: string
) {
  let progress = 0;

  try {
    for (const sourceImage of sourceImages) {
      const outfitDesc = outfitDescriptions[sourceImage.id] || "the outfit shown";
      const faceUrl = faceMatches[sourceImage.id];

      if (!faceUrl) {
        console.log(`No face match for image ${sourceImage.id}, skipping`);
        continue;
      }

      for (let attempt = 0; attempt < job.attempts_per_view; attempt++) {
        console.log(`Generating ${sourceImage.view} attempt ${attempt + 1}/${job.attempts_per_view}`);

        // Create output record
        const { data: output } = await supabase
          .from("face_application_outputs")
          .insert({
            job_id: job.id,
            look_source_image_id: sourceImage.id,
            face_foundation_url: faceUrl,
            view: sourceImage.view,
            attempt_index: attempt,
            outfit_description: outfitDesc,
            status: "generating",
          })
          .select()
          .single();

        try {
          // Build the prompt
          const prompt = `Recreate image 1 with "${outfitDesc}", keep the crop, pose and clothing exactly the same but put the head of image 2 on it.\n\n${STUDIO_LIGHTING_PROMPT}`;

          // Call Lovable AI for image generation
          const generatedUrl = await generateImage(
            sourceImage.source_url, // Original look image (full body)
            faceUrl, // Face foundation
            prompt,
            apiKey
          );

          if (generatedUrl) {
            // Upload to storage
            const storedUrl = await uploadToStorage(supabase, generatedUrl, job.id, output.id);

            // Update output record
            await supabase
              .from("face_application_outputs")
              .update({
                stored_url: storedUrl,
                final_prompt: prompt,
                status: "completed",
              })
              .eq("id", output.id);
          } else {
            await supabase
              .from("face_application_outputs")
              .update({ status: "failed" })
              .eq("id", output.id);
          }
        } catch (genError) {
          console.error(`Generation error for output ${output.id}:`, genError);
          await supabase
            .from("face_application_outputs")
            .update({ status: "failed" })
            .eq("id", output.id);
        }

        progress++;
        await supabase
          .from("face_application_jobs")
          .update({ progress })
          .eq("id", job.id);
      }
    }

    // Mark job complete
    await supabase
      .from("face_application_jobs")
      .update({ status: "completed", progress })
      .eq("id", job.id);

    console.log(`Job ${job.id} completed with ${progress} generations`);
  } catch (error) {
    console.error(`Job ${job.id} failed:`, error);
    await supabase
      .from("face_application_jobs")
      .update({ status: "failed" })
      .eq("id", job.id);
  }
}

async function generateImage(
  bodyImageUrl: string,
  faceImageUrl: string,
  prompt: string,
  apiKey: string
): Promise<string | null> {
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image-preview",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: bodyImageUrl } },
              { type: "image_url", image_url: { url: faceImageUrl } },
            ],
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AI API error: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    return imageUrl || null;
  } catch (error) {
    console.error("Error calling AI API:", error);
    return null;
  }
}

async function uploadToStorage(
  supabase: any,
  base64Url: string,
  jobId: string,
  outputId: string
): Promise<string> {
  // Extract base64 data
  const base64Data = base64Url.replace(/^data:image\/\w+;base64,/, "");
  const imageBuffer = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

  const fileName = `face-application/${jobId}/${outputId}.png`;

  const { error: uploadError } = await supabase.storage
    .from("images")
    .upload(fileName, imageBuffer, {
      contentType: "image/png",
      upsert: true,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data: urlData } = supabase.storage.from("images").getPublicUrl(fileName);

  return urlData.publicUrl;
}
