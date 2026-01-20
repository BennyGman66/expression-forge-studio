// Version: 2026-01-20-v12 - Simplified: Nano Banana Pro + max timeout + direct flow
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Maximum timeout - close to platform limit
const AI_TIMEOUT_MS = 380000;

function fixBrokenStorageUrl(url: string | null | undefined): string {
  if (!url) return '';
  const lastSlash = url.lastIndexOf('/');
  if (lastSlash === -1) return url;
  const basePath = url.slice(0, lastSlash + 1);
  let filename = url.slice(lastSlash + 1);
  filename = filename.replace(/%2520/g, '%20');
  filename = filename.replace(/%252F/g, '%2F');
  filename = filename.replace(/%2523/g, '%23');
  filename = filename.replace(/#/g, '%23');
  return basePath + filename;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  let outputId: string | null = null;

  try {
    const body = await req.json();
    outputId = body.outputId;
    const selectedModel = body.model || "google/gemini-3-pro-image-preview";
    const imageSize = body.imageSize || null;
    
    if (!outputId) {
      return new Response(
        JSON.stringify({ error: "Missing outputId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[generate-repose-single] Starting: outputId=${outputId}, model=${selectedModel}, imageSize=${imageSize || 'default'}`);

    // Mark as running
    await supabase
      .from("repose_outputs")
      .update({ 
        status: "running", 
        started_running_at: new Date().toISOString(),
        requested_resolution: imageSize || "1K",
        error_message: null,
      })
      .eq("id", outputId);

    // Get output details with source and pose URLs
    const { data: output, error: outputError } = await supabase
      .from("repose_outputs")
      .select(`
        *,
        repose_batch_items!batch_item_id(source_url, view, look_id)
      `)
      .eq("id", outputId)
      .single();

    if (outputError || !output) {
      console.error("[generate-repose-single] Failed to fetch output:", outputError);
      await supabase
        .from("repose_outputs")
        .update({ status: "failed", error_message: "Output not found" })
        .eq("id", outputId);
      return new Response(
        JSON.stringify({ error: "Output not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sourceUrl = fixBrokenStorageUrl(output.repose_batch_items?.source_url);
    const poseUrl = fixBrokenStorageUrl(output.pose_url);

    if (!sourceUrl || !poseUrl) {
      console.error("[generate-repose-single] Missing URLs:", { sourceUrl, poseUrl });
      await supabase
        .from("repose_outputs")
        .update({ status: "failed", error_message: "Missing source or pose URL" })
        .eq("id", outputId);
      return new Response(
        JSON.stringify({ error: "Missing URLs" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[generate-repose-single] Source: ${sourceUrl.slice(0, 100)}...`);
    console.log(`[generate-repose-single] Pose: ${poseUrl.slice(0, 100)}...`);

    // Build prompt
    const prompt = `Use the provided greyscale reference image as a strict pose, camera, and framing template.

**OUTPUT FORMAT: Generate a 3:4 portrait aspect ratio image (768x1024 pixels).**

Repose the subject in the input photo to exactly match the reference in:
- body pose and limb positioning
- head tilt and shoulder angle
- weight distribution and stance
- camera height, focal distance, and perspective
- image crop and framing

The output must be a 3:4 portrait aspect ratio image matching the reference pose exactly.

If the reference image does not show the full body, do not include the full body in the output.

Do not zoom out, extend the frame, or reveal additional body parts beyond what is visible in the reference.

Do not alter the subject's identity, facial features, hairstyle, body proportions, clothing, colours, logos, fabric textures, or materials.

Do not stylise or reinterpret the image.

The final image should look like the original photo, naturally repositioned in 3:4 portrait format and cropped identically to the reference image.`;

    // Build request body
    const requestBody: Record<string, unknown> = {
      model: selectedModel,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "text", text: "INPUT PHOTO (subject to repose):" },
            { type: "image_url", image_url: { url: sourceUrl } },
            { type: "text", text: "GREYSCALE REFERENCE (pose, camera, and framing template):" },
            { type: "image_url", image_url: { url: poseUrl } },
          ],
        },
      ],
      modalities: ["image", "text"],
    };

    // Add image_config for higher resolutions
    if (imageSize && imageSize !== "1K") {
      requestBody.image_config = { 
        aspect_ratio: "3:4",
        image_size: imageSize,
      };
      console.log(`[generate-repose-single] Requesting ${imageSize} resolution`);
    }

    // Call AI with long timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    console.log("[generate-repose-single] Calling AI API...");
    const startTime = Date.now();

    let aiResponse: Response;
    try {
      aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.error(`[generate-repose-single] Fetch error after ${elapsed}s:`, fetchError);
      
      const errorMsg = fetchError instanceof Error && fetchError.name === "AbortError"
        ? `Timeout after ${elapsed}s`
        : `Network error: ${fetchError}`;
      
      await supabase
        .from("repose_outputs")
        .update({ status: "failed", error_message: errorMsg })
        .eq("id", outputId);
      
      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    clearTimeout(timeoutId);
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`[generate-repose-single] AI responded in ${elapsed}s with status ${aiResponse.status}`);

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("[generate-repose-single] AI error:", aiResponse.status, errorText);
      
      // Rate limit - requeue for retry
      if (aiResponse.status === 429) {
        await supabase
          .from("repose_outputs")
          .update({ status: "queued", error_message: "Rate limited - will retry" })
          .eq("id", outputId);
        return new Response(
          JSON.stringify({ error: "Rate limited, will retry" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      await supabase
        .from("repose_outputs")
        .update({ status: "failed", error_message: `AI error ${aiResponse.status}: ${errorText.slice(0, 200)}` })
        .eq("id", outputId);
      
      return new Response(
        JSON.stringify({ error: `AI error: ${aiResponse.status}` }),
        { status: aiResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse response
    const aiResult = await aiResponse.json();
    
    // Check for embedded error
    const embeddedError = aiResult.choices?.[0]?.error;
    if (embeddedError) {
      const errorCode = embeddedError.code || "unknown";
      const errorMessage = embeddedError.message || "";
      console.error("[generate-repose-single] Embedded error:", errorCode, errorMessage.slice(0, 100));
      
      const allErrorText = `${errorCode} ${errorMessage}`.toLowerCase();
      if (allErrorText.includes("resource_exhausted") || allErrorText.includes("429") || allErrorText.includes("rate")) {
        await supabase
          .from("repose_outputs")
          .update({ status: "queued", error_message: "Rate limited - will retry" })
          .eq("id", outputId);
        return new Response(
          JSON.stringify({ error: "Rate limited, will retry" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      await supabase
        .from("repose_outputs")
        .update({ status: "failed", error_message: `AI error: ${errorCode}` })
        .eq("id", outputId);
      return new Response(
        JSON.stringify({ error: `AI error: ${errorCode}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const imageData = aiResult.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageData) {
      console.error("[generate-repose-single] No image in response");
      await supabase
        .from("repose_outputs")
        .update({ status: "failed", error_message: "No image in AI response" })
        .eq("id", outputId);
      return new Response(
        JSON.stringify({ error: "No image generated" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract base64 data
    const base64Match = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) {
      console.error("[generate-repose-single] Invalid image format");
      await supabase
        .from("repose_outputs")
        .update({ status: "failed", error_message: "Invalid image format from AI" })
        .eq("id", outputId);
      return new Response(
        JSON.stringify({ error: "Invalid image format" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const [, imageFormat, base64Data] = base64Match;
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    
    console.log(`[generate-repose-single] Got ${imageFormat} image, ${Math.round(binaryData.length / 1024)}KB`);

    // Upload to storage
    const resolution = imageSize || "1K";
    const fileName = `repose/${output.batch_id || "misc"}/${outputId}_${resolution}_${Date.now()}.${imageFormat}`;
    
    const { error: uploadError } = await supabase.storage
      .from("images")
      .upload(fileName, binaryData, {
        contentType: `image/${imageFormat}`,
        upsert: true,
      });

    if (uploadError) {
      console.error("[generate-repose-single] Upload error:", uploadError);
      await supabase
        .from("repose_outputs")
        .update({ status: "failed", error_message: `Upload failed: ${uploadError.message}` })
        .eq("id", outputId);
      return new Response(
        JSON.stringify({ error: "Upload failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from("images")
      .getPublicUrl(fileName);

    const publicUrl = publicUrlData?.publicUrl;
    console.log(`[generate-repose-single] Uploaded: ${publicUrl?.slice(0, 100)}...`);

    // Update based on resolution - 2K/4K goes to fourK_result_url, 1K to result_url
    const updateData: Record<string, unknown> = {
      status: "complete",
      error_message: null,
    };

    if (imageSize === "2K" || imageSize === "4K") {
      updateData.fourK_result_url = publicUrl;
    } else {
      updateData.result_url = publicUrl;
    }

    await supabase
      .from("repose_outputs")
      .update(updateData)
      .eq("id", outputId);

    const totalElapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`[generate-repose-single] Complete! ${resolution} image saved in ${totalElapsed}s.`);

    return new Response(
      JSON.stringify({ success: true, url: publicUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[generate-repose-single] Unexpected error:", error);
    
    if (outputId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase
        .from("repose_outputs")
        .update({ status: "failed", error_message: error instanceof Error ? error.message : "Unknown error" })
        .eq("id", outputId);
    }
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
