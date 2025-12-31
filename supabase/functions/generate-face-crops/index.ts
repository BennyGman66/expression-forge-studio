import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: { waitUntil: (promise: Promise<any>) => void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Face bounding box from AI detection (percentages 0-100)
interface FaceBbox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

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

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 300));
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
  
  // Detect face bounding box using AI
  const faceBbox = await detectFaceBbox(imageUrl, lovableApiKey);
  console.log(`[generate-face-crops] Detection result for ${image.id}:`, faceBbox);
  
  // Calculate head + shoulders crop based on face position
  const cropData = calculateHeadAndShouldersCrop(faceBbox, aspectRatio);
  console.log(`[generate-face-crops] Crop data for ${image.id}:`, cropData);

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

// Detect head bounding box using Gemini (includes all hair)
async function detectFaceBbox(imageUrl: string, apiKey: string): Promise<FaceBbox | null> {
  const prompt = `Detect the person's HEAD in this fashion image.
Return the bounding box coordinates around their ENTIRE HEAD including ALL HAIR - from the very top of their hair down to their chin/jaw line.
Format: JSON array [ymin, xmin, ymax, xmax]
- Coordinates must be normalized to 0-1000 scale (where 0,0 is top-left and 1000,1000 is bottom-right)
- For back views: return the bounding box around the back of their head from hair top to base of skull
- If no person/head is visible, return exactly: NONE
- Only return the array like [123, 456, 789, 567] or NONE, nothing else`;

  try {
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
      return null;
    }

    const data = await response.json();
    const content = (data.choices?.[0]?.message?.content || '').trim();
    
    console.log(`[generate-face-crops] AI response: "${content}"`);
    
    // Check for NONE response
    if (content.toUpperCase().includes('NONE')) {
      return null;
    }
    
    // Parse bounding box array [ymin, xmin, ymax, xmax]
    const match = content.match(/\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\]/);
    if (!match) {
      console.log(`[generate-face-crops] Could not parse bounding box from: "${content}"`);
      return null;
    }

    // Convert from 0-1000 scale to 0-100 percentages
    return {
      ymin: parseInt(match[1]) / 10,
      xmin: parseInt(match[2]) / 10,
      ymax: parseInt(match[3]) / 10,
      xmax: parseInt(match[4]) / 10
    };
  } catch (error) {
    console.error('Head detection error:', error);
    return null;
  }
}

// Calculate head + shoulders crop based on detected head position
function calculateHeadAndShouldersCrop(
  headBbox: FaceBbox | null,
  aspectRatio: string
): { x: number; y: number; width: number; height: number } {
  
  // No head detected - use portrait-focused default in upper portion
  if (!headBbox) {
    if (aspectRatio === '1:1') {
      return { x: 15, y: 0, width: 70, height: 70 };
    } else {
      // 4:5 ratio - taller crop
      return { x: 10, y: 0, width: 80, height: 100 };
    }
  }

  // Calculate head dimensions (now includes full head with hair)
  const headHeight = headBbox.ymax - headBbox.ymin;
  const headWidth = headBbox.xmax - headBbox.xmin;
  const headCenterX = (headBbox.xmin + headBbox.xmax) / 2;
  
  console.log(`[generate-face-crops] Head: height=${headHeight.toFixed(1)}%, width=${headWidth.toFixed(1)}%, center=(${headCenterX.toFixed(1)}, ${headBbox.ymin.toFixed(1)})`);

  // HEAD + SHOULDERS FRAMING:
  // Since we now detect the FULL head (including hair), we need less padding above
  // - Add ~15% of head height ABOVE (just a safety margin for very tall hair)
  // - Add ~150% of head height BELOW (for neck + shoulders + upper chest)
  
  const paddingAbove = headHeight * 0.15;  // Small margin above hair
  const paddingBelow = headHeight * 1.5;   // Space for neck + shoulders
  const totalHeight = headHeight + paddingAbove + paddingBelow;
  
  // Calculate width based on aspect ratio
  let cropWidth: number;
  let cropHeight: number;
  
  if (aspectRatio === '1:1') {
    cropHeight = totalHeight;
    cropWidth = cropHeight; // Square
  } else {
    // For 4:5, height is 1.25x width
    cropHeight = totalHeight;
    cropWidth = cropHeight / 1.25;
  }
  
  // Ensure minimum crop size (at least 45% of image for good framing)
  cropWidth = Math.max(cropWidth, 45);
  cropHeight = Math.max(cropHeight, aspectRatio === '1:1' ? 45 : 56);
  
  // Cap at reasonable max
  cropWidth = Math.min(cropWidth, 95);
  cropHeight = Math.min(cropHeight, 100);

  // Position crop so head is in upper third, centered horizontally
  let cropX = headCenterX - cropWidth / 2;
  let cropY = headBbox.ymin - paddingAbove;
  
  // Clamp to image bounds
  cropX = Math.max(0, Math.min(100 - cropWidth, cropX));
  cropY = Math.max(0, Math.min(100 - cropHeight, cropY));

  return {
    x: Math.round(cropX),
    y: Math.round(cropY),
    width: Math.round(cropWidth),
    height: Math.round(cropHeight)
  };
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
