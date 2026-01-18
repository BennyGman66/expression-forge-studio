import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface DetectionResult {
  imageUrl: string;
  itemId: string;
  viewType: "front" | "back" | "unknown";
  confidence: number;
  reasoning: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { images, batchId, saveResults } = await req.json();

    if (!images?.length) {
      return new Response(
        JSON.stringify({ error: "images array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[detect-view-type] Detecting view types for ${images.length} images`);

    const results: DetectionResult[] = [];

    // Process images in batches of 5 to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < images.length; i += batchSize) {
      const batch = images.slice(i, i + batchSize);
      
      const batchResults = await Promise.all(
        batch.map(async (img: { url: string; itemId: string }) => {
          try {
            const result = await detectSingleImage(img.url, img.itemId);
            return result;
          } catch (error) {
            console.error(`[detect-view-type] Error detecting ${img.itemId}:`, error);
            return {
              imageUrl: img.url,
              itemId: img.itemId,
              viewType: "unknown" as const,
              confidence: 0,
              reasoning: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
            };
          }
        })
      );
      
      results.push(...batchResults);
      
      // Small delay between batches to avoid rate limits
      if (i + batchSize < images.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Save results to database if requested
    if (saveResults && batchId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      for (const result of results) {
        if (result.viewType !== "unknown" && result.confidence >= 0.7) {
          await supabase
            .from("repose_batch_items")
            .update({ assigned_view: result.viewType })
            .eq("id", result.itemId);
        }
      }
      
      console.log(`[detect-view-type] Saved ${results.filter(r => r.viewType !== "unknown" && r.confidence >= 0.7).length} high-confidence detections`);
    }

    const frontCount = results.filter(r => r.viewType === "front").length;
    const backCount = results.filter(r => r.viewType === "back").length;
    const unknownCount = results.filter(r => r.viewType === "unknown").length;

    console.log(`[detect-view-type] Results: ${frontCount} front, ${backCount} back, ${unknownCount} unknown`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        results,
        summary: { front: frontCount, back: backCount, unknown: unknownCount }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[detect-view-type] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function detectSingleImage(imageUrl: string, itemId: string): Promise<DetectionResult> {
  const prompt = `Analyze this fashion/clothing product image and determine if it shows the FRONT or BACK view of the model/product.

FRONT view indicators:
- Person's face is visible
- Person is facing the camera
- You can see the front of the clothing (buttons, zippers, logos on chest, neckline details)

BACK view indicators:
- Person's back is to the camera
- You cannot see the person's face
- You see the back of the clothing (back pockets, back seams, rear design elements)

Respond with a JSON object containing:
- viewType: "front" or "back" (if clearly identifiable) or "unknown" (if unclear)
- confidence: number between 0 and 1 indicating how confident you are
- reasoning: brief explanation (under 20 words)

Only respond with the JSON object, no other text.`;

  const response = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUrl } }
          ]
        }
      ],
      max_tokens: 200,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI gateway error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  
  try {
    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    } else {
      // Try to find JSON object directly
      const objMatch = content.match(/\{[\s\S]*\}/);
      if (objMatch) {
        jsonStr = objMatch[0];
      }
    }
    
    const parsed = JSON.parse(jsonStr);
    return {
      imageUrl,
      itemId,
      viewType: parsed.viewType === "front" || parsed.viewType === "back" ? parsed.viewType : "unknown",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      reasoning: parsed.reasoning || "No reasoning provided",
    };
  } catch {
    console.error(`[detect-view-type] Failed to parse AI response: ${content}`);
    return {
      imageUrl,
      itemId,
      viewType: "unknown",
      confidence: 0,
      reasoning: "Failed to parse AI response",
    };
  }
}
