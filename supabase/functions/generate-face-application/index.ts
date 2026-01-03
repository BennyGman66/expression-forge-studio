import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// View-specific pose and framing instructions
const VIEW_PROMPTS: Record<string, string> = {
  front: `Front-facing portrait with the head held upright and aligned with the torso, showing no noticeable tilt left or right. Chin is neutral and level, giving a centred, composed posture. Eyes looking directly at the camera with a calm, steady gaze. Eyelids moderately open — relaxed and natural, not widened, creating a serene, attentive expression. Brows in a soft, neutral resting position. Mouth closed with an extremely subtle, low-intensity smile: the lips rest naturally with only a faint softening, no upward corner lift.

Keep face and lighting consistent from image 2, make sure to keep freckles intact.`,

  side: `Side-profile pose with shoulders aligned to camera, head facing directly sideways.

Keep face and lighting consistent from image 2. Keep freckles consistent.`,

  back: `Back-facing pose with shoulders squared to the camera. Head is rotated slightly to her left (camera right), creating a soft partial profile. Chin is neutral and level. The face is visible only in side view, with the cheek, jawline, and nose seen in gentle profile while the eyes are turned away from the camera. Overall posture is upright, calm, and centered.

Keep face and lighting consistent from image 2.`,
};

const STUDIO_LIGHTING_PROMPT = `Model photographed in soft, high-key studio lighting against a clean white background with no visible texture. Light is diffused and even, creating minimal shadows. Key light is centred and slightly above eye level, producing gentle falloff on the cheeks and a natural, matte skin appearance. No harsh rim light. Overall look is crisp, neutral, and modern, similar to premium fashion e-commerce photography. Colours are true-to-life with subtle contrast.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { jobId, outfitDescriptions } = await req.json();

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

    // Get source images for this look (with head_cropped_url and digital_talent_id)
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
      processGeneration(supabase, job, sourceImages, outfitDescriptions, LOVABLE_API_KEY);
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
  apiKey: string
) {
  let progress = 0;

  try {
    // Fetch all face foundations for the job's digital talent
    const { data: foundationsData } = await supabase
      .from("face_pairing_outputs")
      .select(`
        id,
        stored_url,
        pairing:face_pairings!inner(
          digital_talent_id,
          cropped_face_id
        )
      `)
      .eq("status", "completed")
      .eq("is_face_foundation", true)
      .not("stored_url", "is", null);

    // Build foundations map by view
    const foundationsByView: Record<string, string> = {};
    let defaultFoundation: string | null = null;

    if (foundationsData) {
      for (const output of foundationsData) {
        const pairing = output.pairing as any;
        if (pairing?.digital_talent_id === job.digital_talent_id && output.stored_url) {
          // Get the view for this foundation
          const { data: identityImage } = await supabase
            .from("face_identity_images")
            .select("view")
            .eq("scrape_image_id", pairing.cropped_face_id)
            .maybeSingle();

          const view = identityImage?.view || "front";
          foundationsByView[view] = output.stored_url;
          
          if (!defaultFoundation || view === "front") {
            defaultFoundation = output.stored_url;
          }
        }
      }
    }

    console.log(`Found face foundations for views:`, Object.keys(foundationsByView));

    for (const sourceImage of sourceImages) {
      const outfitDesc = outfitDescriptions[sourceImage.id] || "the outfit shown";
      
      // Get face foundation - match by view or use default
      const view = sourceImage.view || "front";
      const faceUrl = foundationsByView[view] || foundationsByView["front"] || defaultFoundation;

      if (!faceUrl) {
        console.log(`No face foundation found for image ${sourceImage.id} (view: ${view}), skipping`);
        continue;
      }

      // Use the cropped image, not the full body
      const bodyImageUrl = sourceImage.head_cropped_url;
      if (!bodyImageUrl) {
        console.log(`No cropped image for ${sourceImage.id}, skipping`);
        continue;
      }

      for (let attempt = 0; attempt < job.attempts_per_view; attempt++) {
        console.log(`Generating ${view} attempt ${attempt + 1}/${job.attempts_per_view}`);

        // Create output record
        const { data: output } = await supabase
          .from("face_application_outputs")
          .insert({
            job_id: job.id,
            look_source_image_id: sourceImage.id,
            face_foundation_url: faceUrl,
            view: view,
            attempt_index: attempt,
            outfit_description: outfitDesc,
            status: "generating",
          })
          .select()
          .single();

        try {
          // Build view-specific prompt
          const viewPrompt = VIEW_PROMPTS[view] || VIEW_PROMPTS.front;
          const prompt = `Recreate image 1 with "${outfitDesc}", keep the crop, pose and clothing exactly the same but put the head of image 2 on it. ${viewPrompt}

${STUDIO_LIGHTING_PROMPT}`;

          // Call Lovable AI for image generation
          const generatedUrl = await generateImage(
            bodyImageUrl, // CROPPED head image
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
    console.log(`Generating with body: ${bodyImageUrl.substring(0, 80)}...`);
    console.log(`Face: ${faceImageUrl.substring(0, 80)}...`);
    
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
