import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are an expert at analyzing fashion and editorial photography to extract precise, subtle expression characteristics. 

Analyze the provided brand reference images and extract expression recipes that describe micro-expressions and head angles faithfully. Keep the studio/editorial vibe - avoid generic AI expressions, exaggerated emotions, or "beautifying" adjustments.

For each distinct expression you identify across the images, output a recipe with:
- name: A short, descriptive name for this expression (e.g., "Soft Confidence", "Editorial Neutral")
- angle: Head angle description (e.g., "slight 3/4 turn left", "frontal with subtle chin tilt down")
- gaze: Where the eyes are directed (e.g., "direct to camera", "slightly past lens right")
- eyelids: Openness and tension (e.g., "relaxed, neutral openness", "slightly hooded")
- brows: Position and engagement (e.g., "neutral, minimal tension", "subtle inner lift")
- mouth: Lip state (e.g., "closed, relaxed", "barely parted, no tension")
- jaw: Tension level (e.g., "soft, no clench", "slightly set")
- chin: Position (e.g., "neutral", "subtle forward projection")
- asymmetryNotes: Any intentional asymmetry (e.g., "left brow 1mm higher", "none")
- emotionLabel: The subtle emotional read (e.g., "quiet confidence", "contemplative neutrality")
- intensity: 0-3 scale (0=completely neutral, 1=subtle, 2=moderate, 3=pronounced but still editorial)
- deltaLine: 1-2 lines describing ONLY the micro-adjustments from a neutral base

Output STRICT JSON matching this schema:
{
  "recipes": [
    {
      "name": "string",
      "angle": "string",
      "gaze": "string",
      "eyelids": "string",
      "brows": "string",
      "mouth": "string",
      "jaw": "string",
      "chin": "string",
      "asymmetryNotes": "string",
      "emotionLabel": "string",
      "intensity": 0,
      "deltaLine": "string"
    }
  ]
}

IMPORTANT:
- Extract 10-50 distinct expression recipes from the images
- The deltaLine must describe ONLY micro-adjustments that exist within the references
- Keep descriptions precise and technical, suitable for AI image generation
- Avoid generic descriptions like "natural smile" - be specific about muscle engagement
- Maintain editorial restraint - these should be subtle, controlled expressions
- Each recipe should be distinctly different from others`;

// Background task to analyze images
async function analyzeImagesTask(imageUrls: string[], customPrompt: string | undefined, projectId: string, model: string, supabaseUrl: string, supabaseKey: string) {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log(`Starting background analysis for project ${projectId} with ${imageUrls.length} images`);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return;
    }

    // Build message content with images
    const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      {
        type: "text",
        text: customPrompt 
          ? `${SYSTEM_PROMPT}\n\nAdditional context from user: ${customPrompt}\n\nAnalyze the following images and extract expression recipes:`
          : `${SYSTEM_PROMPT}\n\nAnalyze the following images and extract expression recipes:`
      }
    ];

    // Add image references (limit to first 10 to reduce timeout risk)
    const imagesToAnalyze = imageUrls.slice(0, 10);
    for (const url of imagesToAnalyze) {
      content.push({
        type: "image_url",
        image_url: { url }
      });
    }

    console.log(`Sending ${imagesToAnalyze.length} images to vision model`);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'user',
            content
          }
        ],
        max_tokens: 6000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      return;
    }

    const data = await response.json();
    const assistantMessage = data.choices?.[0]?.message?.content;

    if (!assistantMessage) {
      console.error('No response from AI');
      return;
    }

    console.log('AI response received, parsing JSON...');

    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = assistantMessage;
    const jsonMatch = assistantMessage.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);
    
    if (!parsed.recipes || !Array.isArray(parsed.recipes)) {
      console.error('Invalid response structure:', parsed);
      return;
    }

    console.log(`Successfully extracted ${parsed.recipes.length} recipes, saving to database...`);

    // Save recipes to the database
    for (const recipe of parsed.recipes) {
      const { error: insertError } = await supabase
        .from('expression_recipes')
        .insert({
          project_id: projectId,
          name: recipe.name || 'Unnamed Expression',
          recipe_json: recipe,
          delta_line: recipe.deltaLine || null,
          full_prompt_text: `${recipe.angle}. ${recipe.gaze}. ${recipe.eyelids}. ${recipe.brows}. ${recipe.mouth}. ${recipe.jaw}. ${recipe.chin}. ${recipe.emotionLabel}.`
        });

      if (insertError) {
        console.error('Error inserting recipe:', insertError);
      } else {
        console.log(`Saved recipe: ${recipe.name}`);
      }
    }

    console.log(`Completed: saved ${parsed.recipes.length} recipes for project ${projectId}`);

  } catch (error) {
    console.error('Error in background analyze task:', error);
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrls, customPrompt, projectId, model } = await req.json();

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No image URLs provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!projectId) {
      return new Response(
        JSON.stringify({ error: 'No project ID provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const selectedModel = model || 'google/gemini-2.5-pro';

    console.log(`Starting expression analysis for ${imageUrls.length} images with model ${selectedModel}`);

    // Start background task
    EdgeRuntime.waitUntil(analyzeImagesTask(imageUrls, customPrompt, projectId, selectedModel, supabaseUrl, supabaseKey));

    // Return immediately
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Analyzing ${imageUrls.length} images in background. Recipes will appear shortly.` 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyze-expressions:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
