import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerationRequest {
  projectId: string;
  jobId?: string;
  promptIndex: number;
  prompt: {
    modelId: string;
    modelName: string;
    recipeId: string;
    recipeName: string;
    fullPrompt: string;
    modelRefUrl: string;
  };
  total: number;
  aiModel?: string;
}

interface CreateJobRequest {
  projectId: string;
  total: number;
  aiModel?: string;
}

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
  // Handle CORS preflight
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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("API configuration error");
      return new Response(
        JSON.stringify({ error: "Service temporarily unavailable" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();

    // Check if this is a "create job" request
    if (body.action === "create-job") {
      const { projectId, total } = body as CreateJobRequest;
      
      const { data: job, error: jobError } = await supabase
        .from("jobs")
        .insert({
          project_id: projectId,
          type: "generate",
          status: "running",
          progress: 0,
          total: total,
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

      return new Response(
        JSON.stringify({ success: true, jobId: job.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Otherwise this is a single image generation request
    const { projectId, jobId, promptIndex, prompt, total, aiModel }: GenerationRequest = body;

    if (!projectId || !prompt || !jobId) {
      return new Response(
        JSON.stringify({ error: "Missing projectId, jobId, or prompt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check job status first
    const { data: currentJob } = await supabase
      .from("jobs")
      .select("status, result, logs")
      .eq("id", jobId)
      .single();

    if (currentJob?.status === "stopped") {
      return new Response(
        JSON.stringify({ success: false, stopped: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for skip_current flag
    const jobResult = currentJob?.result as { skip_current?: boolean } | null;
    if (jobResult?.skip_current) {
      // Clear the skip flag and return skipped
      await supabase
        .from("jobs")
        .update({
          result: { ...jobResult, skip_current: false },
          progress: promptIndex + 1,
          updated_at: new Date().toISOString()
        })
        .eq("id", jobId);
      
      return new Response(
        JSON.stringify({ success: true, skipped: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const logEntry = `[${promptIndex + 1}/${total}] Generating ${prompt.recipeName} for ${prompt.modelName}`;
    console.log(logEntry);
    
    // Get existing logs and append
    const existingLogs = Array.isArray(currentJob?.logs) ? currentJob.logs : [];
    const logs = [...existingLogs, logEntry].slice(-50);

    // Update job with current status
    await supabase
      .from("jobs")
      .update({
        logs,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    try {
      // Create abort controller with 60 second timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      // Use the selected AI model or default to Gemini 3 Pro Image
      const selectedModel = aiModel || "google/gemini-3-pro-image-preview";
      console.log(`Using AI model: ${selectedModel}`);

      // Call the image generation model
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: selectedModel,
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
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Generation failed:`, response.status, errorText);
        
        if (response.status === 429) {
          // Rate limited - tell client to retry after delay
          return new Response(
            JSON.stringify({ success: false, rateLimited: true, retryAfter: 5000 }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        if (response.status === 402) {
          // Credits exhausted
          const updatedLogs = [...logs, "❌ Credits exhausted"];
          await supabase.from("jobs").update({ 
            status: "failed",
            logs: updatedLogs.slice(-50),
            updated_at: new Date().toISOString()
          }).eq("id", jobId);
          
          return new Response(
            JSON.stringify({ success: false, creditsExhausted: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Create failed output record
        await supabase.from("outputs").insert({
          project_id: projectId,
          digital_model_id: prompt.modelId,
          recipe_id: prompt.recipeId,
          prompt_used: prompt.fullPrompt,
          status: "failed",
          metrics_json: { error: "Generation failed" },
        });

        const updatedLogs = [...logs, `❌ Failed: ${response.status}`];
        await supabase.from("jobs").update({ 
          progress: promptIndex + 1,
          logs: updatedLogs.slice(-50),
          updated_at: new Date().toISOString()
        }).eq("id", jobId);

        return new Response(
          JSON.stringify({ success: false, error: "Generation failed" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await response.json();
      const imageData = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

      if (!imageData) {
        console.error("No image returned");
        const updatedLogs = [...logs, "❌ No image returned"];
        await supabase.from("jobs").update({ 
          progress: promptIndex + 1,
          logs: updatedLogs.slice(-50),
          updated_at: new Date().toISOString()
        }).eq("id", jobId);

        return new Response(
          JSON.stringify({ success: false, error: "No image returned" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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
        const updatedLogs = [...logs, `❌ Upload failed`];
        await supabase.from("jobs").update({ 
          progress: promptIndex + 1,
          logs: updatedLogs.slice(-50),
          updated_at: new Date().toISOString()
        }).eq("id", jobId);

        return new Response(
          JSON.stringify({ success: false, error: "Upload failed" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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
      }

      // Update job progress with success
      const updatedLogs = [...logs, "✓ Generated successfully"];
      await supabase.from("jobs").update({
        progress: promptIndex + 1,
        logs: updatedLogs.slice(-50),
        updated_at: new Date().toISOString(),
      }).eq("id", jobId);

      return new Response(
        JSON.stringify({ 
          success: true, 
          output,
          imageUrl: publicUrl
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error(`Error processing:`, err);
      
      const logMessage = err instanceof Error && err.name === "AbortError" 
        ? "⏱ Timed out" 
        : `❌ Error occurred`;
      
      const updatedLogs = [...logs, logMessage];
      await supabase.from("jobs").update({
        progress: promptIndex + 1,
        logs: updatedLogs.slice(-50),
        updated_at: new Date().toISOString(),
      }).eq("id", jobId);

      return new Response(
        JSON.stringify({ success: false, error: "Processing error" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("Generate images error:", error);
    return new Response(
      JSON.stringify({ error: "Service temporarily unavailable" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
