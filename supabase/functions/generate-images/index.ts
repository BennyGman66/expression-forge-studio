import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerationRequest {
  projectId: string;
  prompts: {
    modelId: string;
    modelName: string;
    recipeId: string;
    recipeName: string;
    fullPrompt: string;
    modelRefUrl: string;
  }[];
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { projectId, prompts }: GenerationRequest = await req.json();

    if (!projectId || !prompts || prompts.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing projectId or prompts" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Starting generation of ${prompts.length} images for project ${projectId}`);

    // Create a job to track progress
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        project_id: projectId,
        type: "generate",
        status: "running",
        progress: 0,
        total: prompts.length,
        logs: [],
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

    console.log(`Created job ${job.id}`);

    // Process images in background
    const processImages = async () => {
      const results: any[] = [];
      const logs: string[] = [];

      for (let i = 0; i < prompts.length; i++) {
        const prompt = prompts[i];
        const logEntry = `[${i + 1}/${prompts.length}] Generating ${prompt.recipeName} for ${prompt.modelName}`;
        console.log(logEntry);
        logs.push(logEntry);

        try {
          // Call Gemini 3 Pro Image for generation
          const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-3-pro-image-preview",
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: prompt.fullPrompt,
                    },
                    {
                      type: "image_url",
                      image_url: {
                        url: prompt.modelRefUrl,
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
            console.error(`Generation failed for prompt ${i}:`, response.status, errorText);
            
            if (response.status === 429) {
              logs.push(`Rate limited, waiting...`);
              await new Promise(r => setTimeout(r, 5000));
              i--; // Retry this prompt
              continue;
            }
            
            if (response.status === 402) {
              logs.push(`Credits exhausted`);
              break;
            }

            // Create failed output record
            await supabase.from("outputs").insert({
              project_id: projectId,
              digital_model_id: prompt.modelId,
              recipe_id: prompt.recipeId,
              prompt_used: prompt.fullPrompt,
              status: "failed",
              metrics_json: { error: errorText },
            });
            continue;
          }

          const data = await response.json();
          const imageData = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

          if (!imageData) {
            console.error(`No image returned for prompt ${i}`);
            logs.push(`No image returned`);
            continue;
          }

          // Upload base64 image to storage
          const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
          const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
          const fileName = `projects/${projectId}/outputs/${Date.now()}-${Math.random().toString(36).substring(7)}.png`;

          const { error: uploadError } = await supabase.storage
            .from("images")
            .upload(fileName, imageBytes, {
              contentType: "image/png",
              upsert: false,
            });

          if (uploadError) {
            console.error("Upload error:", uploadError);
            logs.push(`Upload failed: ${uploadError.message}`);
            continue;
          }

          const { data: { publicUrl } } = supabase.storage
            .from("images")
            .getPublicUrl(fileName);

          // Save output record
          const { data: output, error: outputError } = await supabase
            .from("outputs")
            .insert({
              project_id: projectId,
              digital_model_id: prompt.modelId,
              recipe_id: prompt.recipeId,
              prompt_used: prompt.fullPrompt,
              image_url: publicUrl,
              status: "completed",
            })
            .select()
            .single();

          if (outputError) {
            console.error("Failed to save output:", outputError);
          } else {
            results.push(output);
            logs.push(`✓ Generated successfully`);
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : "Unknown error";
          console.error(`Error processing prompt ${i}:`, err);
          logs.push(`Error: ${errorMessage}`);
        }

        // Update job progress
        await supabase
          .from("jobs")
          .update({
            progress: i + 1,
            logs: logs.slice(-50), // Keep last 50 log entries
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        // Small delay between requests to avoid rate limiting
        if (i < prompts.length - 1) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      // Mark job as complete
      await supabase
        .from("jobs")
        .update({
          status: "completed",
          progress: prompts.length,
          result: { generated: results.length, total: prompts.length },
          logs: logs.slice(-50),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      console.log(`Job ${job.id} completed: ${results.length}/${prompts.length} images generated`);
    };

    // Start background processing
    (globalThis as any).EdgeRuntime?.waitUntil?.(processImages()) ?? processImages();

    // Return immediately with job ID
    return new Response(
      JSON.stringify({ 
        success: true, 
        jobId: job.id,
        message: `Started generating ${prompts.length} images` 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Generate images error:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
