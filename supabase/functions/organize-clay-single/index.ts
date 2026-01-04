import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLASSIFICATION_PROMPT = `Analyze this product/fashion image and classify it.

FIRST, determine if this image should be DELETED:
- Is this a photo of a CHILD (anyone who appears under 18)? → DELETE
- Is this a PRODUCT-ONLY shot with NO PERSON visible (flat lay, just clothing/accessories on a surface or mannequin)? → DELETE

IF the image should be kept (adult model visible), classify into the correct SLOT:
- A (Full Front): Full body visible from head to at least mid-thigh/knees, FRONT-facing view (face visible)
- B (Cropped Front): Upper body only (waist up), FRONT-facing, legs NOT fully visible, OR 3/4 angle views
- C (Full Back): Full body visible from head to at least mid-thigh/knees, BACK view (back of head visible)
- D (Detail): Close-up/detail shot, OR side profile, OR very tight crop showing specific body parts

RESPONSE FORMAT (exactly one of):
DELETE_CHILD - if showing a child/minor
DELETE_PRODUCT - if product-only with no person
A - Full front body shot
B - Cropped front / upper body
C - Full back body shot
D - Detail / close-up / side profile

Respond with ONLY the classification code, nothing else.`;

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
