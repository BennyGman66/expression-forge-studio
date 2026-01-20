// Version: 2026-01-20-v11 - Restored 400s platform limit timeouts for 4K renders
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Track current output for shutdown handler
let currentOutputId: string | null = null;

// Shutdown handler - mark in-progress outputs as queued for retry
addEventListener('beforeunload', async () => {
  if (!currentOutputId) return;
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    console.log(`[generate-repose-single] Worker shutdown, requeueing output ${currentOutputId}`);
    
    await supabase
      .from('repose_outputs')
      .update({ 
        status: 'queued',
        error_message: 'Worker shutdown - will retry',
        started_running_at: null,
      })
      .eq('id', currentOutputId)
      .in('status', ['running']);
  } catch (e) {
    console.error('[generate-repose-single] Shutdown handler error:', e);
  }
});

/**
 * Fixes broken storage URLs that contain unencoded hash (#) characters.
 * The hash character causes the API to interpret the rest as a URL fragment.
 */
function fixBrokenStorageUrl(url: string | null | undefined): string {
  if (!url) return '';
  
  const lastSlash = url.lastIndexOf('/');
  if (lastSlash === -1) return url;
  
  const basePath = url.slice(0, lastSlash + 1);
  let filename = url.slice(lastSlash + 1);
  
  // Fix double-encoded characters
  filename = filename.replace(/%2520/g, '%20');
  filename = filename.replace(/%252F/g, '%2F');
  filename = filename.replace(/%2523/g, '%23');
  
  // Encode unencoded # characters
  const fixedFilename = filename.replace(/#/g, '%23');
  
  return basePath + fixedFilename;
}

/**
 * Wraps a promise with a timeout. Rejects if the promise doesn't resolve in time.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMsg)), ms)
    ),
  ]);
}

// Extended timeouts for 400s platform limit
const AI_TIMEOUT_MS = 300000; // 300s (5 min) for AI call - 4K renders need time
const BODY_TIMEOUT_MS = 350000; // 350s for body read - large 4K payloads need time

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { outputId, model, imageSize } = await req.json();
    const selectedModel = model || 'google/gemini-3-pro-image-preview';
    // imageSize can be '1K', '2K', or '4K' - defaults to standard resolution
    const selectedImageSize = imageSize || null;
    
    if (!outputId) {
      return new Response(
        JSON.stringify({ error: 'Missing outputId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Track for shutdown handler
    currentOutputId = outputId;
    
    console.log(`[generate-repose-single] Starting output ${outputId}, model: ${selectedModel}, imageSize: ${selectedImageSize || 'default'}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Mark as running and set resolution + start time
    await supabase
      .from('repose_outputs')
      .update({ 
        status: 'running',
        requested_resolution: selectedImageSize || '1K',
        started_running_at: new Date().toISOString(),
      })
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

    const sourceUrl = fixBrokenStorageUrl(output.repose_batch_items?.source_url);
    const poseUrl = fixBrokenStorageUrl(output.pose_url);
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

    // Generate the reposed image using AI
    const prompt = `Use the provided greyscale reference image as a strict pose, camera, and framing template.

**OUTPUT FORMAT: Generate a 3:4 portrait aspect ratio image (768x1024 pixels).**

Repose the subject in the input photo to exactly match the reference in:
- body pose and limb positioning
- head tilt and shoulder angle
- weight distribution and stance
- camera height, focal distance, and perspective
- image crop and framing

The output must be a 3:4 portrait aspect ratio image matching the reference pose exactly.

If the reference image does not show the full body, do not include the full body in the output.

Do not zoom out, extend the frame, or reveal additional body parts beyond what is visible in the reference.

Do not alter the subject's identity, facial features, hairstyle, body proportions, clothing, colours, logos, fabric textures, or materials.

Do not stylise or reinterpret the image.

The final image should look like the original photo, naturally repositioned in 3:4 portrait format and cropped identically to the reference image.`;

    // Build request body with optional image_config for higher resolution
    const requestBody: Record<string, unknown> = {
      model: selectedModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'text', text: 'INPUT PHOTO (subject to repose):' },
            { type: 'image_url', image_url: { url: sourceUrl } },
            { type: 'text', text: 'GREYSCALE REFERENCE (pose, camera, and framing template):' },
            { type: 'image_url', image_url: { url: poseUrl } },
          ],
        },
      ],
      modalities: ['image', 'text'],
      aspect_ratio: '3:4', // Portrait aspect ratio
    };
    
    // Add image_config with image_size if specified (1K, 2K, or 4K)
    if (selectedImageSize) {
      requestBody.image_config = {
        aspect_ratio: '3:4',
        image_size: selectedImageSize,
      };
      console.log(`[generate-repose-single] Using image_config with size: ${selectedImageSize}`);
    }

    // Call AI API with timeout protection
    const aiResponse = await withTimeout(
      fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }),
      AI_TIMEOUT_MS,
      `AI generation timed out after ${AI_TIMEOUT_MS / 1000}s`
    );
    
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`[generate-repose-single] AI response received in ${elapsed}s, reading body...`);

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[generate-repose-single] AI API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        await supabase
          .from('repose_outputs')
          .update({ status: 'queued' })
          .eq('id', outputId);
        return new Response(
          JSON.stringify({ error: 'Rate limited, will retry' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    // Read response body with conservative timeout - must complete before 150s platform limit
    console.log(`[generate-repose-single] Starting body read with ${Math.round(BODY_TIMEOUT_MS/1000)}s timeout...`);
    
    let responseText: string;
    try {
      responseText = await withTimeout(
        aiResponse.text(),
        BODY_TIMEOUT_MS,
        `Response body read timed out after ${Math.round(BODY_TIMEOUT_MS/1000)}s`
      );
    } catch (bodyError) {
      const errorMsg = bodyError instanceof Error ? bodyError.message : 'Unknown body read error';
      console.error(`[generate-repose-single] Body read failed: ${errorMsg}`);
      
      // If we timeout reading the body, AI likely succeeded - requeue for retry
      if (errorMsg.includes('timed out')) {
        await supabase
          .from('repose_outputs')
          .update({ status: 'queued' })
          .eq('id', outputId);
        return new Response(
          JSON.stringify({ error: 'Body read timeout, will retry', status: 'queued' }),
          { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw bodyError;
    }
    
    const totalElapsedAfterBody = Math.round((Date.now() - startTime) / 1000);
    console.log(`[generate-repose-single] Got ${Math.round(responseText.length / 1024)}KB response in ${totalElapsedAfterBody}s`);
    
    // Parse JSON to verify response is complete and valid
    let aiResult;
    try {
      aiResult = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[generate-repose-single] JSON parse error:', parseError);
      await supabase
        .from('repose_outputs')
        .update({ status: 'failed', error_message: 'Invalid JSON response from AI' })
        .eq('id', outputId);
      return new Response(
        JSON.stringify({ error: 'Invalid AI response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Check for embedded error in response
    const embeddedError = aiResult.choices?.[0]?.error;
    if (embeddedError) {
      const errorCode = embeddedError.code;
      const errorMessage = embeddedError.message || '';
      console.error('[generate-repose-single] Embedded error:', errorCode, errorMessage.slice(0, 100));
      
      const allErrorText = `${errorCode} ${errorMessage}`.toLowerCase();
      if (allErrorText.includes('resource_exhausted') || allErrorText.includes('429') || allErrorText.includes('rate')) {
        await supabase
          .from('repose_outputs')
          .update({ status: 'queued' })
          .eq('id', outputId);
        return new Response(
          JSON.stringify({ error: 'Rate limited, will retry' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      await supabase
        .from('repose_outputs')
        .update({ status: 'failed', error_message: `AI error: ${errorCode}` })
        .eq('id', outputId);
      return new Response(
        JSON.stringify({ error: `AI error: ${errorCode}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Extract the generated image URL
    const generatedImageUrl = aiResult.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!generatedImageUrl) {
      console.error('[generate-repose-single] No image in response');
      await supabase
        .from('repose_outputs')
        .update({ status: 'failed', error_message: 'No image generated' })
        .eq('id', outputId);
      return new Response(
        JSON.stringify({ error: 'No image generated' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Extract base64 data
    const base64Match = generatedImageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) {
      console.error('[generate-repose-single] Invalid image format');
      await supabase
        .from('repose_outputs')
        .update({ status: 'failed', error_message: 'Invalid image format' })
        .eq('id', outputId);
      return new Response(
        JSON.stringify({ error: 'Invalid image format' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const imageFormat = base64Match[1];
    const base64Data = base64Match[2];
    const base64SizeKB = Math.round(base64Data.length / 1024);
    console.log(`[generate-repose-single] Extracted ${imageFormat} base64: ${base64SizeKB}KB`);
    
    const totalElapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`[generate-repose-single] AI + parse complete in ${totalElapsed}s`);
    
    // TWO-PHASE APPROACH: For large 4K images, save base64 to temp storage first
    // This ensures we don't lose the data if the function times out during upload
    const is4K = selectedImageSize === '4K' || base64SizeKB > 5000; // >5MB suggests 4K
    
    if (is4K) {
      // Phase 1: Save base64 to temp storage (fast text upload ~1-2s)
      const tempPath = `temp/${outputId}_${Date.now()}.${imageFormat}.b64`;
      console.log(`[generate-repose-single] 4K detected (${base64SizeKB}KB), saving to temp: ${tempPath}`);
      
      const encoder = new TextEncoder();
      const tempBytes = encoder.encode(base64Data);
      
      const { error: tempError } = await supabase.storage
        .from('images')
        .upload(tempPath, tempBytes, {
          contentType: 'text/plain',
          upsert: true,
        });

      if (tempError) {
        console.error('[generate-repose-single] Temp save failed:', tempError);
        await supabase
          .from('repose_outputs')
          .update({ status: 'failed', error_message: 'Temp storage save failed' })
          .eq('id', outputId);
        return new Response(
          JSON.stringify({ error: 'Temp storage save failed' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Update status with temp_path so complete-repose-upload can finish the job
      await supabase
        .from('repose_outputs')
        .update({ 
          status: 'uploading',
          temp_path: tempPath,
          error_message: null,
        })
        .eq('id', outputId);

      console.log(`[generate-repose-single] Saved ${base64SizeKB}KB to temp in ${Math.round((Date.now() - startTime) / 1000)}s, returning 202`);

      // Clear tracking - phase 1 complete, phase 2 handled by complete-repose-upload
      currentOutputId = null;

      // Return 202 - the queue processor will call complete-repose-upload
      return new Response(
        JSON.stringify({ 
          success: true, 
          status: 'uploading',
          temp_path: tempPath,
          message: 'Image saved to temp storage, awaiting final upload',
        }),
        { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // For smaller images (<5MB), do direct upload (original approach)
    console.log(`[generate-repose-single] Standard size (${base64SizeKB}KB), doing direct upload`);
    
    const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const fileName = `repose/${output.batch_id}/${outputId}_${Date.now()}.${imageFormat}`;
    
    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(fileName, imageBytes, {
        contentType: `image/${imageFormat}`,
        upsert: true,
      });

    if (uploadError) {
      console.error('[generate-repose-single] Direct upload failed:', uploadError);
      await supabase
        .from('repose_outputs')
        .update({ status: 'failed', error_message: 'Storage upload failed' })
        .eq('id', outputId);
      return new Response(
        JSON.stringify({ error: 'Storage upload failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: publicUrl } = supabase.storage
      .from('images')
      .getPublicUrl(fileName);

    await supabase
      .from('repose_outputs')
      .update({ 
        status: 'complete',
        result_url: publicUrl.publicUrl,
        error_message: null,
        temp_path: null,
      })
      .eq('id', outputId);

    console.log(`[generate-repose-single] Direct upload complete: ${publicUrl.publicUrl}`);
    
    // Clear tracking - we're done
    currentOutputId = null;
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        status: 'complete',
        result_url: publicUrl.publicUrl,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[generate-repose-single] Error:', errorMessage);
    
    // Try to handle the error appropriately
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
        
        // Check if we were in 'uploading' status (AI succeeded but processing timed out)
        const { data: currentOutput } = await supabase
          .from('repose_outputs')
          .select('status, temp_path')
          .eq('id', outputId)
          .single();
        
        if (currentOutput?.status === 'uploading') {
          // AI succeeded, leave in uploading - background task or complete-repose-upload will handle
          console.log('[generate-repose-single] Error during uploading phase, background task will continue');
          return new Response(
            JSON.stringify({ success: true, status: 'uploading', message: 'Background processing continues' }),
            { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Otherwise mark as failed
        await supabase
          .from('repose_outputs')
          .update({ status: 'failed', error_message: errorMessage })
          .eq('id', outputId);
      }
    } catch (e) {
      console.error('[generate-repose-single] Failed to handle error:', e);
    }

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// NOTE: Background upload function removed - we now use two-phase approach
// Phase 1: generate-repose-single saves base64 to temp storage
// Phase 2: complete-repose-upload handles final upload (called by queue processor)

