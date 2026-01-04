import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLASSIFICATION_PROMPT = `You are a fashion image classifier. Analyze this image and respond with EXACTLY ONE code.

## STEP 1: CHECK FOR DELETION (do this first!)

DELETE_CHILD - Use if ANY person in the image appears to be under 18 years old. This includes:
  - Children
  - Teenagers
  - Young-looking models (when in doubt about age, DELETE)

DELETE_PRODUCT - Use if there is NO HUMAN BODY visible. This includes:
  - Flat lay shots (clothing laid flat on a surface)
  - Clothing on mannequins or dress forms
  - Close-ups of just fabric, texture, or material
  - Accessories only (bags, shoes, jewelry, hats) with no person wearing them
  - Ghost mannequin / invisible model shots
  - Hanger shots

## STEP 2: CLASSIFY (only if adult human model is clearly visible)

A - FULL FRONT: Must show face + torso + legs (at least to mid-thigh). Person faces the camera.
B - CROPPED FRONT: Shows face and upper body (waist up). Legs NOT visible or cut off. Also use for 3/4 angle views.
C - FULL BACK: Full body view but person's BACK is to camera. Back of head visible, face not visible.
D - DETAIL: Everything else - side profiles, close-ups of specific body parts, unusual angles, partial body shots.

## RULES
- Respond with ONLY the code: DELETE_CHILD, DELETE_PRODUCT, A, B, C, or D
- No explanations, no punctuation, just the code
- When in doubt about age → DELETE_CHILD
- When in doubt about whether a person is present → DELETE_PRODUCT`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageId, imageUrl } = await req.json();

    if (!imageId || !imageUrl) {
      return new Response(
        JSON.stringify({ error: "imageId and imageUrl are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    console.log(`Classifying image ${imageId}`);

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
              { type: "text", text: CLASSIFICATION_PROMPT },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("Classification API error:", response.status);
      return new Response(
        JSON.stringify({ error: "Classification API failed", action: null }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const result = (data.choices?.[0]?.message?.content || "").trim().toUpperCase();

    // Parse the result
    let action: string | null = null;

    if (["A", "B", "C", "D", "DELETE_CHILD", "DELETE_PRODUCT"].includes(result)) {
      action = result;
    } else {
      // Try to extract from longer response
      if (result.includes("DELETE_CHILD")) action = "DELETE_CHILD";
      else if (result.includes("DELETE_PRODUCT")) action = "DELETE_PRODUCT";
      else {
        const match = result.match(/^([ABCD])/);
        action = match ? match[1] : null;
      }
    }

    console.log(`Image ${imageId} classified as: ${action}`);

    return new Response(
      JSON.stringify({ imageId, action }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage, action: null }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
