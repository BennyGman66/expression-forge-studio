import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: { waitUntil: (promise: Promise<any>) => void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OUTFIT_DESCRIPTION_PROMPT = `Describe the clothing and styling worn by the person in this image.

Focus only on:
- Garments (type and layering)
- Materials and texture
- Colour and tone
- Fit
- Visible construction details (e.g. quilting, stitching, collar type)

Do NOT describe:
- Face, hair, age, gender, or body
- Mood, personality, or pose
- Brand names

Output a single concise sentence suitable for insertion into an image generation prompt.`;

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
        status: 'describing',
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);

    // Start background processing
    EdgeRuntime.waitUntil(processOutfitDescriptions(supabase, jobId, lovableApiKey));

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in generate-outfit-description:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function processOutfitDescriptions(
  supabase: any,
  jobId: string,
  lovableApiKey: string
) {
  try {
    // Get all pairings for this job that need outfit descriptions
    const { data: pairings, error: pairingsError } = await supabase
      .from('face_pairings')
      .select(`
        id,
        cropped_face_id,
        face_scrape_images!cropped_face_id (
          id,
          source_url,
          stored_url
        )
      `)
      .eq('job_id', jobId)
      .eq('outfit_description_status', 'pending');

    if (pairingsError) {
      throw new Error(`Failed to fetch pairings: ${pairingsError.message}`);
    }

    if (!pairings || pairings.length === 0) {
      console.log('[generate-outfit-description] No pairings to process');
      return;
    }

    console.log(`[generate-outfit-description] Processing ${pairings.length} pairings`);

    // Group by cropped_face_id to avoid duplicate API calls
    const uniqueFaces = new Map<string, { url: string; pairingIds: string[] }>();
    
    for (const pairing of pairings) {
      const faceImage = pairing.face_scrape_images;
      if (!faceImage) continue;
      
      const imageUrl = faceImage.stored_url || faceImage.source_url;
      const existing = uniqueFaces.get(pairing.cropped_face_id);
      
      if (existing) {
        existing.pairingIds.push(pairing.id);
      } else {
        uniqueFaces.set(pairing.cropped_face_id, {
          url: imageUrl,
          pairingIds: [pairing.id]
        });
      }
    }

    console.log(`[generate-outfit-description] ${uniqueFaces.size} unique faces to describe`);

    let processed = 0;
    
    for (const [faceId, { url, pairingIds }] of uniqueFaces) {
      try {
        const description = await generateOutfitDescription(url, lovableApiKey);
        console.log(`[generate-outfit-description] Face ${faceId}: "${description}"`);
        
        // Update all pairings with this face
        await supabase
          .from('face_pairings')
          .update({
            outfit_description: description,
            outfit_description_status: 'completed'
          })
          .in('id', pairingIds);
        
        processed++;
        
        // Update job progress
        await updateJobProgress(supabase, jobId, processed, uniqueFaces.size, 'describing');
        
      } catch (error) {
        console.error(`[generate-outfit-description] Error for face ${faceId}:`, error);
        
        await supabase
          .from('face_pairings')
          .update({ outfit_description_status: 'failed' })
          .in('id', pairingIds);
      }

      // Small delay between API calls
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`[generate-outfit-description] Completed: ${processed}/${uniqueFaces.size}`);
    
    // Update job status - ready for generation
    await supabase
      .from('face_pairing_jobs')
      .update({ 
        status: 'generating',
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);

  } catch (error) {
    console.error('[generate-outfit-description] Background error:', error);
    
    await supabase
      .from('face_pairing_jobs')
      .update({ 
        status: 'failed',
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);
  }
}

async function generateOutfitDescription(imageUrl: string, apiKey: string): Promise<string> {
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: OUTFIT_DESCRIPTION_PROMPT },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  
  return content.trim();
}

async function updateJobProgress(
  supabase: any, 
  jobId: string, 
  progress: number, 
  total: number,
  stage: string
) {
  const { data: job } = await supabase
    .from('face_pairing_jobs')
    .select('logs')
    .eq('id', jobId)
    .single();

  const logs = job?.logs || [];
  logs.push({ 
    timestamp: new Date().toISOString(), 
    message: `[${stage}] ${progress}/${total} completed`
  });

  await supabase
    .from('face_pairing_jobs')
    .update({
      progress,
      logs,
      updated_at: new Date().toISOString()
    })
    .eq('id', jobId);
}
