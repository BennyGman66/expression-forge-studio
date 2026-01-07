import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { outputId } = await req.json();

    if (!outputId) {
      return new Response(
        JSON.stringify({ error: "outputId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch the output to regenerate
    const { data: output, error: outputError } = await supabase
      .from("face_application_outputs")
      .select(`
        *,
        job:face_application_jobs!inner(
          id,
          model,
          digital_talent_id
        )
      `)
      .eq("id", outputId)
      .single();

    if (outputError || !output) {
      console.error("Output not found:", outputError);
      return new Response(
        JSON.stringify({ error: "Output not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Regenerating output ${outputId} for view ${output.view}`);

    // Mark as pending
    await supabase
      .from("face_application_outputs")
      .update({ status: "pending" })
      .eq("id", outputId);

    // Get face foundation for this view and talent
    const { data: foundationData } = await supabase
      .from("face_pairing_outputs")
      .select(`
        stored_url,
        pairing:face_pairings!inner(
          digital_talent_id,
          cropped_face_id
        )
      `)
      .eq("status", "completed")
      .eq("is_face_foundation", true)
      .not("stored_url", "is", null);

    // Find foundation matching talent and view
    let faceFoundationUrl: string | null = null;
    const job = output.job as any;

    if (foundationData) {
      for (const f of foundationData) {
        const pairing = f.pairing as any;
        if (pairing?.digital_talent_id === job.digital_talent_id) {
          // Get the view of this foundation
          const { data: identityImage } = await supabase
            .from("face_identity_images")
            .select("view")
            .eq("scrape_image_id", pairing.cropped_face_id)
            .maybeSingle();

          if (identityImage?.view?.toLowerCase() === output.view?.toLowerCase()) {
            faceFoundationUrl = f.stored_url;
            break;
          }
        }
      }
    }

    if (!faceFoundationUrl || !output.face_foundation_url) {
      faceFoundationUrl = output.face_foundation_url;
    }

    if (!faceFoundationUrl) {
      console.error("No face foundation found");
      await supabase
        .from("face_application_outputs")
        .update({ status: "failed" })
        .eq("id", outputId);
      return new Response(
        JSON.stringify({ error: "No face foundation found for this view" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use original prompt or regenerate
    const prompt = output.final_prompt || `Recreate image 1 with the outfit shown, keeping the crop, pose and clothing exactly the same but put the head of image 2 on it. Make the face look natural with neutral expression.`;

    // Get the source image (head cropped url)
    const { data: sourceImage } = await supabase
      .from("look_source_images")
      .select("head_cropped_url, source_url")
      .eq("id", output.look_source_image_id)
      .single();

    const bodyImageUrl = sourceImage?.head_cropped_url || sourceImage?.source_url || "";

    if (!bodyImageUrl) {
      console.error("No source image found");
      await supabase
        .from("face_application_outputs")
        .update({ status: "failed" })
        .eq("id", outputId);
      return new Response(
        JSON.stringify({ error: "Source image not found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const model = job.model || "google/gemini-2.5-flash-image-preview";

    console.log(`Generating with model: ${model}`);
    console.log(`Body: ${bodyImageUrl.substring(0, 60)}...`);
    console.log(`Face: ${faceFoundationUrl.substring(0, 60)}...`);

    // Call AI API
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: bodyImageUrl } },
              { type: "image_url", image_url: { url: faceFoundationUrl } },
            ],
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI API error:", errText);
      await supabase
        .from("face_application_outputs")
        .update({ status: "failed" })
        .eq("id", outputId);
      return new Response(
        JSON.stringify({ error: "AI generation failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const generatedImageBase64 = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!generatedImageBase64) {
      console.error("No image in AI response");
      await supabase
        .from("face_application_outputs")
        .update({ status: "failed" })
        .eq("id", outputId);
      return new Response(
        JSON.stringify({ error: "No image generated" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Upload to storage
    const base64Data = generatedImageBase64.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const fileName = `face-application/regen-${outputId}-${Date.now()}.png`;

    const { error: uploadError } = await supabase.storage
      .from("images")
      .upload(fileName, imageBuffer, { contentType: "image/png", upsert: true });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      await supabase
        .from("face_application_outputs")
        .update({ status: "failed" })
        .eq("id", outputId);
      return new Response(
        JSON.stringify({ error: "Failed to upload image" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: publicUrl } = supabase.storage.from("images").getPublicUrl(fileName);
    const storedUrl = publicUrl.publicUrl;

    // Update output
    await supabase
      .from("face_application_outputs")
      .update({
        stored_url: storedUrl,
        status: "completed",
      })
      .eq("id", outputId);

    console.log(`Regeneration complete: ${storedUrl}`);

    return new Response(
      JSON.stringify({ success: true, stored_url: storedUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});