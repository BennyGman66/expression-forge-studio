import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: { waitUntil: (promise: Promise<any>) => void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FaceDetectionResult {
  faceDetected: boolean;
  faceCenterX: number;
  faceCenterY: number;
  suggestedCropX: number;
  suggestedCropY: number;
  suggestedCropWidth: number;
  suggestedCropHeight: number;
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
      .not('stored_url', 'is', null);

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

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
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
  const imageUrl = image.stored_url;
  
  // Call AI to detect face location
  const faceResult = await detectFace(imageUrl, lovableApiKey);
  
  if (!faceResult.faceDetected) {
    console.log(`No face detected in image ${image.id}`);
    // Still create a crop record with default center crop
    await createDefaultCrop(supabase, image.id, aspectRatio);
    return;
  }

  // Calculate crop coordinates based on face detection and aspect ratio
  const cropData = calculateCrop(faceResult, aspectRatio);

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

async function detectFace(imageUrl: string, apiKey: string): Promise<FaceDetectionResult> {
  const prompt = `Analyze this fashion/product image and locate the model's face.
Return the face position as percentages of image dimensions (0-100).
Also return the optimal crop rectangle for a portrait headshot that includes the face with proper framing.

Return ONLY valid JSON in this exact format, no other text:
{
  "faceDetected": true,
  "faceCenterX": 50,
  "faceCenterY": 25,
  "suggestedCropX": 25,
  "suggestedCropY": 5,
  "suggestedCropWidth": 50,
  "suggestedCropHeight": 60
}

If no face is detected, return:
{"faceDetected": false, "faceCenterX": 50, "faceCenterY": 50, "suggestedCropX": 25, "suggestedCropY": 10, "suggestedCropWidth": 50, "suggestedCropHeight": 80}`;

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
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as FaceDetectionResult;
    }

    throw new Error('No valid JSON in AI response');
  } catch (error) {
    console.error('Face detection error:', error);
    // Return default center detection on error
    return {
      faceDetected: false,
      faceCenterX: 50,
      faceCenterY: 30,
      suggestedCropX: 25,
      suggestedCropY: 10,
      suggestedCropWidth: 50,
      suggestedCropHeight: 80
    };
  }
}

function calculateCrop(faceResult: FaceDetectionResult, aspectRatio: string): { x: number; y: number; width: number; height: number } {
  // Use suggested crop from AI, adjusted for aspect ratio
  let width = faceResult.suggestedCropWidth;
  let height = faceResult.suggestedCropHeight;
  
  // Adjust for aspect ratio
  if (aspectRatio === '1:1') {
    // Square: use the larger dimension
    const size = Math.max(width, height);
    width = size;
    height = size;
  } else if (aspectRatio === '4:5') {
    // Portrait: height should be 1.25x width
    if (height < width * 1.25) {
      height = width * 1.25;
    } else {
      width = height / 1.25;
    }
  }
  
  // Center the crop on the face
  let x = faceResult.faceCenterX - width / 2;
  let y = faceResult.faceCenterY - height / 3; // Face in upper third
  
  // Clamp to image bounds
  x = Math.max(0, Math.min(100 - width, x));
  y = Math.max(0, Math.min(100 - height, y));
  
  // Ensure dimensions don't exceed bounds
  width = Math.min(width, 100 - x);
  height = Math.min(height, 100 - y);
  
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height)
  };
}

async function createDefaultCrop(supabase: any, imageId: string, aspectRatio: string) {
  const { data: existingCrop } = await supabase
    .from('face_crops')
    .select('id')
    .eq('scrape_image_id', imageId)
    .single();

  const cropData = aspectRatio === '1:1'
    ? { x: 25, y: 10, width: 50, height: 50 }
    : { x: 25, y: 5, width: 50, height: 62 }; // 4:5 ratio

  if (existingCrop) {
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
    await supabase
      .from('face_crops')
      .insert({
        scrape_image_id: imageId,
        crop_x: cropData.x,
        crop_y: cropData.y,
        crop_width: cropData.width,
        crop_height: cropData.height,
        aspect_ratio: aspectRatio,
        is_auto: true
      });
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
