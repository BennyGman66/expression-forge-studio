import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { outputId } = await req.json();

    if (!outputId) {
      return new Response(JSON.stringify({ error: 'outputId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[regenerate-output] Starting regeneration for output ${outputId}`);

    // Get the output record with pairing and job details
    const { data: output, error: outputError } = await supabase
      .from('face_pairing_outputs')
      .select(`
        id,
        pairing_id,
        final_prompt,
        face_pairings!inner (
          id,
          cropped_face_id,
          digital_talent_id,
          job_id,
          outfit_description,
          face_scrape_images!cropped_face_id (
            id,
            source_url,
            stored_url
          ),
          digital_talents!digital_talent_id (
            id,
            front_face_url
          )
        )
      `)
      .eq('id', outputId)
      .single();

    if (outputError || !output) {
      console.error('[regenerate-output] Failed to fetch output:', outputError);
      return new Response(JSON.stringify({ error: 'Output not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const pairing = output.face_pairings as any;
    const faceImage = pairing.face_scrape_images;
    const digitalTalent = pairing.digital_talents;

    if (!faceImage || !digitalTalent?.front_face_url) {
      console.error('[regenerate-output] Missing required images');
      return new Response(JSON.stringify({ error: 'Missing source images' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the model from the job
    const { data: job } = await supabase
      .from('face_pairing_jobs')
      .select('model')
      .eq('id', pairing.job_id)
      .single();

    const model = job?.model || 'google/gemini-2.5-flash-image-preview';

    // Try to get the cropped image URL
    const { data: cropData } = await supabase
      .from('face_crops')
      .select('cropped_stored_url')
      .eq('scrape_image_id', faceImage.id)
      .maybeSingle();

    const image1Url = cropData?.cropped_stored_url || faceImage.stored_url || faceImage.source_url;
    const image2Url = digitalTalent.front_face_url;
    const finalPrompt = output.final_prompt;

    console.log(`[regenerate-output] Using prompt: ${finalPrompt?.substring(0, 100)}...`);
    console.log(`[regenerate-output] Image 1: ${image1Url.substring(0, 80)}...`);
    console.log(`[regenerate-output] Image 2: ${image2Url.substring(0, 80)}...`);

    // Mark output as regenerating (running status)
    await supabase
      .from('face_pairing_outputs')
      .update({ status: 'running' })
      .eq('id', outputId);

    // Call AI for image generation
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: finalPrompt },
              { type: 'image_url', image_url: { url: image1Url } },
              { type: 'image_url', image_url: { url: image2Url } }
            ]
          }
        ],
        modalities: ['image', 'text']
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[regenerate-output] AI API error: ${response.status} - ${errorText}`);
      
      await supabase
        .from('face_pairing_outputs')
        .update({ status: 'failed', error_message: 'AI generation failed' })
        .eq('id', outputId);
      
      return new Response(JSON.stringify({ error: 'AI generation failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const images = data.choices?.[0]?.message?.images;

    if (!images || images.length === 0) {
      console.error('[regenerate-output] No image generated');
      
      await supabase
        .from('face_pairing_outputs')
        .update({ status: 'failed', error_message: 'No image generated' })
        .eq('id', outputId);
      
      return new Response(JSON.stringify({ error: 'No image generated' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const generatedImageUrl = images[0].image_url?.url;

    // Upload to storage with unique filename
    const timestamp = Date.now();
    const filePath = `pairing-outputs/regenerated/${outputId}-${timestamp}.png`;
    
    const base64Data = generatedImageUrl.replace(/^data:image\/\w+;base64,/, '');
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(filePath, binaryData, {
        contentType: 'image/png',
        upsert: true
      });

    if (uploadError) {
      console.error('[regenerate-output] Upload error:', uploadError);
      
      await supabase
        .from('face_pairing_outputs')
        .update({ status: 'failed', error_message: 'Failed to upload image' })
        .eq('id', outputId);
      
      return new Response(JSON.stringify({ error: 'Failed to upload image' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const storedUrl = `${supabaseUrl}/storage/v1/object/public/images/${filePath}`;

    // Update output with new image
    await supabase
      .from('face_pairing_outputs')
      .update({
        stored_url: storedUrl,
        status: 'completed',
        error_message: null
      })
      .eq('id', outputId);

    console.log(`[regenerate-output] Successfully regenerated output ${outputId}`);

    return new Response(JSON.stringify({ 
      success: true, 
      stored_url: storedUrl 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[regenerate-output] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
