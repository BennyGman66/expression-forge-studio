import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerationTask {
  talentImageUrl: string;
  talentImageId: string;
  view: string;
  slot: string;
  poseId: string;
  poseUrl: string;
  attempt: number;
  lookId?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { jobId, task, model } = body as { 
      jobId: string; 
      task: GenerationTask; 
      model: string;
    };

    if (!jobId || !task) {
      return new Response(
        JSON.stringify({ error: "jobId and task are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if job is still running (not stopped/cancelled)
    const { data: job, error: jobError } = await supabase
      .from("generation_jobs")
      .select("status")
      .eq("id", jobId)
      .single();

    if (jobError) {
      console.error("Failed to fetch job:", jobError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch job", skipped: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (job.status === "stopped" || job.status === "cancelled" || job.status === "failed") {
      console.log(`Job ${jobId} is ${job.status}, skipping generation`);
      return new Response(
        JSON.stringify({ success: false, skipped: true, reason: `Job ${job.status}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[${task.view}/${task.slot}] Generating with pose ${task.poseId}, attempt ${task.attempt + 1}`);

    // Generate image using Lovable AI
    const prompt = `Put the woman from IMAGE 1 (Talent Reference) in the exact pose shown in IMAGE 2 (Pose Reference).

CRITICAL INSTRUCTIONS:
- Keep the face, skin tone, hair, and physical features consistent with IMAGE 1
- Keep the outfit and clothing from IMAGE 1 exactly as shown
- Copy the exact body pose, stance, arm positions, and leg positions from IMAGE 2
- Use professional studio lighting similar to IMAGE 1
- Background should be clean white or light grey studio backdrop
- Maintain photorealistic e-commerce quality
- Match the camera angle and framing from IMAGE 2

Generate a high-quality fashion photograph combining the talent's appearance and outfit from IMAGE 1 with the pose from IMAGE 2.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || "google/gemini-2.5-flash-image-preview",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "text", text: "IMAGE 1 - TALENT REFERENCE (copy this person's appearance and outfit):" },
              { type: "image_url", image_url: { url: task.talentImageUrl } },
              { type: "text", text: "IMAGE 2 - POSE REFERENCE (copy this exact pose):" },
              { type: "image_url", image_url: { url: task.poseUrl } },
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
        return new Response(
          JSON.stringify({ success: false, rateLimited: true, error: "Rate limited" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ success: false, error: `AI API error: ${response.status}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const generatedImageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!generatedImageUrl) {
      console.error("No image returned from AI");
      return new Response(
        JSON.stringify({ success: false, error: "No image returned from AI" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Upload to storage
    const base64Data = generatedImageUrl.replace(/^data:image\/\w+;base64,/, "");
    const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    
    const fileName = `generations/${jobId}/${task.view}_${task.slot}_${task.poseId}_${task.attempt}_${Date.now()}.png`;
    const { error: uploadError } = await supabase.storage
      .from("images")
      .upload(fileName, binaryData, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error(`Upload error:`, uploadError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to upload image" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: { publicUrl } } = supabase.storage
      .from("images")
      .getPublicUrl(fileName);

    // Save to generations table
    const { error: insertError } = await supabase
      .from("generations")
      .insert({
        generation_job_id: jobId,
        pose_clay_image_id: task.poseId,
        attempt_index: task.attempt,
        stored_url: publicUrl,
        look_id: task.lookId,
        talent_image_id: task.talentImageId !== "legacy" ? task.talentImageId : null,
        view: task.view,
        slot: task.slot,
      });

    if (insertError) {
      console.error(`Insert error:`, insertError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to save generation" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Successfully generated ${fileName}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        imageUrl: publicUrl,
        fileName 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
