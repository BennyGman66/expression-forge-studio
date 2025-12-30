import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: { waitUntil: (promise: Promise<any>) => void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simplified detection types for fashion images
type DetectionType = 'FACE' | 'HEAD' | 'NONE';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { runId, aspectRatio = '1:1' } = await req.json();

    if (!runId) {
      return new Response(JSON.stringify({ error: 'runId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Create job record
    const { data: job, error: jobError } = await supabase
      .from('face_jobs')
      .insert({
        scrape_run_id: runId,
        type: 'crop',
        status: 'pending',
        progress: 0,
        total: 0,
        logs: [{ timestamp: new Date().toISOString(), message: 'Job created' }]
      })
      .select()
      .single();

    if (jobError) {
      console.error('Error creating job:', jobError);
      return new Response(JSON.stringify({ error: 'Failed to create job' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Start background processing
    EdgeRuntime.waitUntil(processCrops(supabase, job.id, runId, aspectRatio, lovableApiKey));

    return new Response(JSON.stringify({ success: true, jobId: job.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in generate-face-crops:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function processCrops(
  supabase: any,
  jobId: string,
  runId: string,
  aspectRatio: string,
  lovableApiKey: string
) {
  try {
    // Get all images for this run that have stored URLs
    const { data: images, error: imagesError } = await supabase
      .from('face_scrape_images')
      .select('*')
      .eq('scrape_run_id', runId)
      .not('source_url', 'is', null);

    console.log(`[generate-face-crops] Received runId: ${runId}`);
    console.log(`[generate-face-crops] Found ${images?.length || 0} images to process`);

    if (imagesError) {
      throw new Error(`Failed to fetch images: ${imagesError.message}`);
    }

    if (!images || images.length === 0) {
      await updateJob(supabase, jobId, 'completed', 0, 0, 'No images to process');
      return;
    }

    await updateJob(supabase, jobId, 'running', 0, images.length, `Processing ${images.length} images`);

    let processed = 0;
    let failed = 0;

    for (const image of images) {
      try {
        await processImage(supabase, image, aspectRatio, lovableApiKey);
        processed++;
        await updateJob(supabase, jobId, 'running', processed, images.length, `Processed ${processed}/${images.length}`);
      } catch (error) {
        console.error(`Error processing image ${image.id}:`, error);
        failed++;
        await addLog(supabase, jobId, `Failed to process image: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Reduced delay - faster since simpler AI prompt
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    const finalStatus = failed === images.length ? 'failed' : 'completed';
    const finalMessage = `Completed: ${processed} processed, ${failed} failed`;
    await updateJob(supabase, jobId, finalStatus, processed, images.length, finalMessage);

  } catch (error) {
    console.error('Background processing error:', error);
    await updateJob(supabase, jobId, 'failed', 0, 0, `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function processImage(
  supabase: any,
  image: any,
  aspectRatio: string,
  lovableApiKey: string
) {
  const imageUrl = image.stored_url || image.source_url;
  console.log(`[generate-face-crops] Processing image ${image.id}`);
  
  // Quick AI check - just classify the image
  const detection = await quickDetectPerson(imageUrl, lovableApiKey);
  console.log(`[generate-face-crops] Detection result for ${image.id}: ${detection}`);
  
  // Get smart fashion crop based on detection
  const cropData = getFashionCrop(detection, aspectRatio);

  // Check if crop already exists
  const { data: existingCrop } = await supabase
    .from('face_crops')
    .select('id')
    .eq('scrape_image_id', image.id)
    .single();

  if (existingCrop) {
    // Update existing crop
    await supabase
      .from('face_crops')
      .update({
        crop_x: cropData.x,
        crop_y: cropData.y,
        crop_width: cropData.width,
        crop_height: cropData.height,
        aspect_ratio: aspectRatio,
        is_auto: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', existingCrop.id);
  } else {
    // Insert new crop
    await supabase
      .from('face_crops')
      .insert({
        scrape_image_id: image.id,
        crop_x: cropData.x,
        crop_y: cropData.y,
        crop_width: cropData.width,
        crop_height: cropData.height,
        aspect_ratio: aspectRatio,
        is_auto: true
      });
  }
}

// Simplified AI prompt - just classify the image quickly
async function quickDetectPerson(imageUrl: string, apiKey: string): Promise<DetectionType> {
  const prompt = `Look at this fashion product image. Is there a person's face or back of head visible in the TOP PORTION of the image?
Reply with ONLY one word: "FACE" or "HEAD" or "NONE"`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite', // Faster model for simple classification
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageUrl } }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      return 'NONE';
    }

    const data = await response.json();
    const content = (data.choices?.[0]?.message?.content || '').trim().toUpperCase();
    
    console.log(`[generate-face-crops] AI response: "${content}"`);
    
    // Parse the simple response
    if (content.includes('FACE')) return 'FACE';
    if (content.includes('HEAD')) return 'HEAD';
    return 'NONE';
  } catch (error) {
    console.error('Quick detection error:', error);
    return 'NONE';
  }
}

// Smart default crops for fashion images based on detection type
function getFashionCrop(detection: DetectionType, aspectRatio: string): { x: number; y: number; width: number; height: number } {
  // Fashion images: subject typically centered, head at top
  if (detection === 'FACE' || detection === 'HEAD') {
    if (aspectRatio === '1:1') {
      // Top center square - capture head and shoulders
      return { x: 20, y: 0, width: 60, height: 60 };
    } else {
      // 4:5 portrait - top center, more vertical space for shoulders
      return { x: 15, y: 0, width: 70, height: 87 }; // 70 * 1.25 ≈ 87.5
    }
  }
  
  // No person detected - center crop
  if (aspectRatio === '1:1') {
    return { x: 20, y: 20, width: 60, height: 60 };
  } else {
    // 4:5 ratio
    return { x: 15, y: 10, width: 70, height: 87 };
  }
}

async function updateJob(supabase: any, jobId: string, status: string, progress: number, total: number, message: string) {
  const { data: job } = await supabase
    .from('face_jobs')
    .select('logs')
    .eq('id', jobId)
    .single();

  const logs = job?.logs || [];
  logs.push({ timestamp: new Date().toISOString(), message });

  await supabase
    .from('face_jobs')
    .update({
      status,
      progress,
      total,
      logs,
      updated_at: new Date().toISOString()
    })
    .eq('id', jobId);
}

async function addLog(supabase: any, jobId: string, message: string) {
  const { data: job } = await supabase
    .from('face_jobs')
    .select('logs')
    .eq('id', jobId)
    .single();

  const logs = job?.logs || [];
  logs.push({ timestamp: new Date().toISOString(), message });

  await supabase
    .from('face_jobs')
    .update({ logs, updated_at: new Date().toISOString() })
    .eq('id', jobId);
}
