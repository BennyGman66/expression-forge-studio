import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: { waitUntil: (promise: Promise<any>) => void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Prompt template matching the reference workflow exactly
const BASE_PROMPT_TEMPLATE = `Recreate image 1 keep the crop, pose, and {{OUTFIT_DESCRIPTION}} keep it exactly the same but put the head of image 2 on it. Neutral expression with a subtle, relaxed softness at the corners of the mouth. Head very slightly tilted.

Model shot in soft, high-key studio lighting. Background is clean white with no visible texture. Light is diffused and even, creating minimal shadows. Key light is centred and slightly above eye level, producing gentle falloff on the cheeks and a natural, matte skin appearance. No harsh rim light. Overall look is crisp, neutral, and modern, similar to premium fashion e-commerce photography. Colours are true-to-life with subtle contrast.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { jobId } = await req.json();

    if (!jobId) {
      return new Response(JSON.stringify({ error: 'jobId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update job status
    await supabase
      .from('face_pairing_jobs')
      .update({ 
        status: 'generating',
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);

    // Start background processing - pass model from job
    const { data: jobData } = await supabase
      .from('face_pairing_jobs')
      .select('model')
      .eq('id', jobId)
      .single();
    
    EdgeRuntime.waitUntil(processPairedGeneration(supabase, jobId, supabaseUrl, lovableApiKey));

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in generate-paired-images:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function processPairedGeneration(
  supabase: any,
  jobId: string,
  supabaseUrl: string,
  lovableApiKey: string
) {
  const MAX_PROCESSING_TIME_MS = 50000; // 50 seconds to stay under Deno limit
  const startTime = Date.now();

  const isNearTimeout = () => Date.now() - startTime > MAX_PROCESSING_TIME_MS;

  try {
    // Check if job was cancelled
    const { data: currentJob } = await supabase
      .from('face_pairing_jobs')
      .select('status')
      .eq('id', jobId)
      .single();

    if (currentJob?.status === 'failed') {
      console.log('[generate-paired-images] Job was cancelled, stopping');
      return;
    }

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from('face_pairing_jobs')
      .select('attempts_per_pairing, model')
      .eq('id', jobId)
      .single();

    if (jobError) throw new Error(`Failed to fetch job: ${jobError.message}`);

    const attemptsPerPairing = job?.attempts_per_pairing || 1;
    const model = job?.model || 'google/gemini-2.5-flash-image-preview';

    // Get all pairings with their related data (using Digital Talent model)
    const { data: pairings, error: pairingsError } = await supabase
      .from('face_pairings')
      .select(`
        id,
        outfit_description,
        cropped_face_id,
        digital_talent_id,
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
      .eq('job_id', jobId)
      .eq('outfit_description_status', 'completed')
      .eq('status', 'pending');

    if (pairingsError) {
      throw new Error(`Failed to fetch pairings: ${pairingsError.message}`);
    }

    if (!pairings || pairings.length === 0) {
      console.log('[generate-paired-images] No pairings to process');
      await supabase
        .from('face_pairing_jobs')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', jobId);
      return;
    }

    console.log(`[generate-paired-images] Processing ${pairings.length} pairings with ${attemptsPerPairing} attempts each`);

    const totalGenerations = pairings.length * attemptsPerPairing;
    let completed = 0;
    let failed = 0;

    for (const pairing of pairings) {
      // Check for timeout and self-continue
      if (isNearTimeout()) {
        console.log('[generate-paired-images] Approaching timeout, self-continuing...');
        await supabase.functions.invoke('generate-paired-images', { body: { jobId } });
        return;
      }

      // Check if job was cancelled
      const { data: jobCheck } = await supabase
        .from('face_pairing_jobs')
        .select('status')
        .eq('id', jobId)
        .single();

      if (jobCheck?.status === 'failed') {
        console.log('[generate-paired-images] Job was cancelled, stopping');
        return;
      }

      const faceImage = pairing.face_scrape_images;
      const digitalTalent = pairing.digital_talents;

      if (!faceImage || !digitalTalent?.front_face_url) {
        console.log(`[generate-paired-images] Missing images for pairing ${pairing.id} - faceImage: ${!!faceImage}, digitalTalent: ${!!digitalTalent}, front_face_url: ${digitalTalent?.front_face_url}`);
        await supabase
          .from('face_pairings')
          .update({ status: 'failed' })
          .eq('id', pairing.id);
        failed += attemptsPerPairing;
        continue;
      }

      // Try to get the cropped image URL from face_crops table
      const { data: cropData } = await supabase
        .from('face_crops')
        .select('cropped_stored_url')
        .eq('scrape_image_id', faceImage.id)
        .maybeSingle();
      
      // Prioritize cropped image, then fall back to original
      const image1Url = cropData?.cropped_stored_url || faceImage.stored_url || faceImage.source_url;
      const image2Url = digitalTalent.front_face_url;
      
      // Log which image types are being used for debugging
      const usingCropped = !!cropData?.cropped_stored_url;
      console.log(`[generate-paired-images] Pairing ${pairing.id}:`);
      console.log(`  - Image 1 (outfit/body): ${usingCropped ? 'CROPPED' : 'ORIGINAL'} - ${image1Url.substring(0, 80)}...`);
      console.log(`  - Image 2 (face): ${image2Url.substring(0, 80)}...`);
      
      if (!usingCropped) {
        console.warn(`[generate-paired-images] WARNING: No cropped image available, using original full-body image`);
      }
      
      const outfitDescription = pairing.outfit_description || 'A fashionable outfit';

      // Build the final prompt
      const finalPrompt = BASE_PROMPT_TEMPLATE.replace('{{OUTFIT_DESCRIPTION}}', outfitDescription);

      // Generate multiple attempts
      for (let attempt = 0; attempt < attemptsPerPairing; attempt++) {
        try {
          // Create output record
          const { data: output, error: outputError } = await supabase
            .from('face_pairing_outputs')
            .insert({
              pairing_id: pairing.id,
              attempt_index: attempt,
              final_prompt: finalPrompt,
              status: 'running'
            })
            .select()
            .single();

          if (outputError) {
            console.error(`[generate-paired-images] Failed to create output record:`, outputError);
            failed++;
            continue;
          }

          // Call AI for image generation
          const generatedImageUrl = await generatePairedImage(
            image1Url,
            image2Url,
            finalPrompt,
            lovableApiKey,
            model
          );

          if (generatedImageUrl) {
            // Upload to storage
            const storedUrl = await uploadToStorage(
              supabase,
              supabaseUrl,
              generatedImageUrl,
              `pairing-outputs/${jobId}/${pairing.id}-${attempt}.png`
            );

            await supabase
              .from('face_pairing_outputs')
              .update({
                stored_url: storedUrl,
                status: 'completed'
              })
              .eq('id', output.id);

            completed++;
          } else {
            await supabase
              .from('face_pairing_outputs')
              .update({
                status: 'failed',
                error_message: 'No image generated'
              })
              .eq('id', output.id);
            failed++;
          }

        } catch (error) {
          console.error(`[generate-paired-images] Error on attempt ${attempt}:`, error);
          failed++;
        }

        // Update job progress
        await updateJobProgress(supabase, jobId, completed + failed, totalGenerations);

        // Delay between generations
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Mark pairing as completed
      await supabase
        .from('face_pairings')
        .update({ status: 'completed' })
        .eq('id', pairing.id);
    }

    // Final job status
    const finalStatus = failed === totalGenerations ? 'failed' : 'completed';
    
    await supabase
      .from('face_pairing_jobs')
      .update({
        status: finalStatus,
        progress: completed + failed,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);

    console.log(`[generate-paired-images] Completed: ${completed} success, ${failed} failed`);

  } catch (error) {
    console.error('[generate-paired-images] Background error:', error);
    
    await supabase
      .from('face_pairing_jobs')
      .update({ 
        status: 'failed',
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);
  }
}

async function generatePairedImage(
  image1Url: string,
  image2Url: string,
  prompt: string,
  apiKey: string,
  model: string
): Promise<string | null> {
  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
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
      console.error(`[generate-paired-images] AI API error: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    const images = data.choices?.[0]?.message?.images;
    
    if (images && images.length > 0) {
      return images[0].image_url?.url || null;
    }

    return null;
  } catch (error) {
    console.error('[generate-paired-images] Generation error:', error);
    return null;
  }
}

async function uploadToStorage(
  supabase: any,
  supabaseUrl: string,
  base64DataUrl: string,
  filePath: string
): Promise<string> {
  // Extract base64 data
  const base64Data = base64DataUrl.replace(/^data:image\/\w+;base64,/, '');
  const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

  const { error: uploadError } = await supabase.storage
    .from('images')
    .upload(filePath, binaryData, {
      contentType: 'image/png',
      upsert: true
    });

  if (uploadError) {
    console.error('[generate-paired-images] Upload error:', uploadError);
    throw uploadError;
  }

  return `${supabaseUrl}/storage/v1/object/public/images/${filePath}`;
}

async function updateJobProgress(supabase: any, jobId: string, progress: number, total: number) {
  await supabase
    .from('face_pairing_jobs')
    .update({
      progress,
      total_pairings: total,
      updated_at: new Date().toISOString()
    })
    .eq('id', jobId);
}
