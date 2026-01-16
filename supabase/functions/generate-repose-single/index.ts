import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { outputId, model } = await req.json();
    const selectedModel = model || 'google/gemini-2.5-flash-image-preview';
    if (!outputId) {
      return new Response(
        JSON.stringify({ error: 'Missing outputId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[generate-repose-single] Processing output: ${outputId}, model: ${selectedModel}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Mark as running
    await supabase
      .from('repose_outputs')
      .update({ status: 'running' })
      .eq('id', outputId);

    // Get the output with batch item and pose info
    const { data: output, error: outputError } = await supabase
      .from('repose_outputs')
      .select(`
        *,
        repose_batch_items!batch_item_id(source_url, view, look_id)
      `)
      .eq('id', outputId)
      .single();

    if (outputError || !output) {
      console.error('[generate-repose-single] Failed to fetch output:', outputError);
      throw new Error('Output not found');
    }

    const sourceUrl = output.repose_batch_items?.source_url;
    const poseUrl = output.pose_url;
    const shotType = output.shot_type || 'FRONT_FULL';

    if (!sourceUrl || !poseUrl) {
      console.error('[generate-repose-single] Missing source or pose URL');
      await supabase
        .from('repose_outputs')
        .update({ status: 'failed' })
        .eq('id', outputId);
      return new Response(
        JSON.stringify({ error: 'Missing source or pose URL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[generate-repose-single] Source: ${sourceUrl}`);
    console.log(`[generate-repose-single] Pose: ${poseUrl}`);
    console.log(`[generate-repose-single] Shot Type: ${shotType}`);

    // Shot-type-specific framing instructions
    const shotTypeInstructions: Record<string, string> = {
      FRONT_FULL: 'Generate a full-body photograph from head to feet. The entire outfit should be visible.',
      FRONT_CROPPED: 'Generate a CROPPED upper-body photograph showing ONLY waist up. Crop the image below the waist - do NOT show full legs.',
      BACK_FULL: 'Generate a full-body back view photograph from head to feet. Show the back of the outfit completely.',
      DETAIL: 'Generate a close-up detail shot focusing on a specific area of the outfit.',
    };

    const framingInstruction = shotTypeInstructions[shotType] || shotTypeInstructions.FRONT_FULL;

    // Generate the reposed image using AI
    const prompt = `You are a fashion photography expert specializing in pose transfer for e-commerce.

TASK: ${framingInstruction}

Transfer the exact body pose from the grey clay mannequin reference onto the fashion model in the product image.

CRITICAL - READ CAREFULLY:

IMAGE 1 (Product Photo): This is your ONLY source for:
- The model's face, skin tone, and hair
- ALL clothing items, colors, patterns, accessories, and styling
- The background and lighting style

IMAGE 2 (Grey Clay Mannequin): This is ONLY a pose reference showing:
- Body position and posture
- Arm and hand placement
- Leg stance and orientation
- The mannequin is a GREY SCULPTURE with NO CLOTHING - ignore any apparent texture

REQUIREMENTS:
1. POSE: Exactly replicate the mannequin's body position
2. CLOTHING: Use ONLY the exact clothing from Image 1 - same colors, same items, same accessories
3. FACE: Keep the model's exact facial features from Image 1
4. FRAMING: ${framingInstruction}
5. QUALITY: Output should look like a professional fashion photograph

NEVER:
- Change the clothing color or style
- Add or remove accessories
- Take any styling cues from the grey mannequin
- Generate different garments than what appears in Image 1`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: sourceUrl } },
              { type: 'image_url', image_url: { url: poseUrl } },
            ],
          },
        ],
        modalities: ['image', 'text'],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[generate-repose-single] AI API error:', response.status, errorText);
      
      if (response.status === 429) {
        await supabase
          .from('repose_outputs')
          .update({ status: 'queued' })
          .eq('id', outputId);
        return new Response(
          JSON.stringify({ error: 'Rate limited, will retry' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiResult = await response.json();
    const generatedImageUrl = aiResult.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!generatedImageUrl) {
      console.error('[generate-repose-single] No image in response:', JSON.stringify(aiResult).slice(0, 500));
      throw new Error('No image generated');
    }

    // Extract base64 data and upload to storage
    const base64Match = generatedImageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) {
      throw new Error('Invalid image data format');
    }

    const imageFormat = base64Match[1];
    const base64Data = base64Match[2];
    const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

    const fileName = `repose/${output.batch_id}/${outputId}_${Date.now()}.${imageFormat}`;
    
    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(fileName, imageBytes, {
        contentType: `image/${imageFormat}`,
        upsert: true,
      });

    if (uploadError) {
      console.error('[generate-repose-single] Upload error:', uploadError);
      throw new Error('Failed to upload image');
    }

    const { data: publicUrl } = supabase.storage
      .from('images')
      .getPublicUrl(fileName);

    // Update output with result
    await supabase
      .from('repose_outputs')
      .update({ 
        status: 'complete',
        result_url: publicUrl.publicUrl,
      })
      .eq('id', outputId);

    console.log(`[generate-repose-single] Successfully generated: ${publicUrl.publicUrl}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        resultUrl: publicUrl.publicUrl,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[generate-repose-single] Error:', errorMessage);
    
    // Try to mark as failed if we have the outputId
    try {
      const { outputId } = await (async () => {
        try {
          return await req.clone().json();
        } catch {
          return { outputId: null };
        }
      })();
      
      if (outputId) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        await supabase
          .from('repose_outputs')
          .update({ status: 'failed' })
          .eq('id', outputId);
      }
    } catch (e) {
      console.error('[generate-repose-single] Failed to mark as failed:', e);
    }

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
