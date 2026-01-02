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
    const { pairingId, count } = await req.json();

    if (!pairingId || !count) {
      return new Response(JSON.stringify({ error: 'pairingId and count are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate count (max 24)
    const validCount = Math.min(Math.max(1, count), 24);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[generate-more-outputs] Starting generation of ${validCount} more outputs for pairing ${pairingId}`);

    // Get the pairing with all related data
    const { data: pairing, error: pairingError } = await supabase
      .from('face_pairings')
      .select(`
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
      `)
      .eq('id', pairingId)
      .single();

    if (pairingError || !pairing) {
      console.error('[generate-more-outputs] Failed to fetch pairing:', pairingError);
      return new Response(JSON.stringify({ error: 'Pairing not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const faceImage = pairing.face_scrape_images as any;
    const digitalTalent = pairing.digital_talents as any;

    if (!faceImage || !digitalTalent?.front_face_url) {
      console.error('[generate-more-outputs] Missing required images');
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

    // Get an existing output to use its prompt
    const { data: existingOutput } = await supabase
      .from('face_pairing_outputs')
      .select('final_prompt')
      .eq('pairing_id', pairingId)
      .not('final_prompt', 'is', null)
      .limit(1)
      .single();

    // Build prompt (use existing or generate new)
    let finalPrompt = existingOutput?.final_prompt;
    if (!finalPrompt) {
      const outfitDesc = pairing.outfit_description || "casual clothing";
      finalPrompt = `Apply the face from the second image onto the person in the first image. Keep the exact pose, clothing (${outfitDesc}), and background from the first image. Only change the face to match the second image's facial features, skin tone, and expression while maintaining natural lighting and seamless blending.`;
    }

    // Get current max attempt_index for this pairing
    const { data: maxAttempt } = await supabase
      .from('face_pairing_outputs')
      .select('attempt_index')
      .eq('pairing_id', pairingId)
      .order('attempt_index', { ascending: false })
      .limit(1)
      .single();

    const startIndex = (maxAttempt?.attempt_index ?? -1) + 1;

    console.log(`[generate-more-outputs] Starting from attempt_index ${startIndex}`);
    console.log(`[generate-more-outputs] Using prompt: ${finalPrompt.substring(0, 100)}...`);

    // Create placeholder output records
    const outputRecords = [];
    for (let i = 0; i < validCount; i++) {
      outputRecords.push({
        pairing_id: pairingId,
        attempt_index: startIndex + i,
        status: 'running',
        final_prompt: finalPrompt,
      });
    }

    const { data: createdOutputs, error: createError } = await supabase
      .from('face_pairing_outputs')
      .insert(outputRecords)
      .select();

    if (createError) {
      console.error('[generate-more-outputs] Failed to create outputs:', createError);
      return new Response(JSON.stringify({ error: 'Failed to create output records' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate images for each output
    const results = [];
    for (const output of createdOutputs) {
      try {
        console.log(`[generate-more-outputs] Generating image for output ${output.id}`);

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
          console.error(`[generate-more-outputs] AI API error for ${output.id}: ${response.status} - ${errorText}`);
          
          await supabase
            .from('face_pairing_outputs')
            .update({ status: 'failed', error_message: 'AI generation failed' })
            .eq('id', output.id);
          
          results.push({ id: output.id, status: 'failed' });
          continue;
        }

        const data = await response.json();
        const images = data.choices?.[0]?.message?.images;

        if (!images || images.length === 0) {
          console.error(`[generate-more-outputs] No image generated for ${output.id}`);
          
          await supabase
            .from('face_pairing_outputs')
            .update({ status: 'failed', error_message: 'No image generated' })
            .eq('id', output.id);
          
          results.push({ id: output.id, status: 'failed' });
          continue;
        }

        const generatedImageUrl = images[0].image_url?.url;

        // Upload to storage
        const timestamp = Date.now();
        const filePath = `pairing-outputs/additional/${output.id}-${timestamp}.png`;
        
        const base64Data = generatedImageUrl.replace(/^data:image\/\w+;base64,/, '');
        const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

        const { error: uploadError } = await supabase.storage
          .from('images')
          .upload(filePath, binaryData, {
            contentType: 'image/png',
            upsert: true
          });

        if (uploadError) {
          console.error(`[generate-more-outputs] Upload error for ${output.id}:`, uploadError);
          
          await supabase
            .from('face_pairing_outputs')
            .update({ status: 'failed', error_message: 'Failed to upload image' })
            .eq('id', output.id);
          
          results.push({ id: output.id, status: 'failed' });
          continue;
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
          .eq('id', output.id);

        console.log(`[generate-more-outputs] Successfully generated output ${output.id}`);
        results.push({ id: output.id, status: 'completed', stored_url: storedUrl });

      } catch (err) {
        console.error(`[generate-more-outputs] Error generating ${output.id}:`, err);
        
        await supabase
          .from('face_pairing_outputs')
          .update({ status: 'failed', error_message: err instanceof Error ? err.message : 'Unknown error' })
          .eq('id', output.id);
        
        results.push({ id: output.id, status: 'failed' });
      }
    }

    const successCount = results.filter(r => r.status === 'completed').length;
    console.log(`[generate-more-outputs] Completed: ${successCount}/${validCount} outputs`);

    return new Response(JSON.stringify({ 
      success: true, 
      generated: successCount,
      total: validCount,
      results 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[generate-more-outputs] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
