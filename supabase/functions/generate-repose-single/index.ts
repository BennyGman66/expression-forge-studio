// Version: 2026-01-19-v3 - Fixed status update to uploading before 202
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

const AI_TIMEOUT_MS = 35000; // 35 second timeout for AI calls - leaves room for temp upload

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

    console.log(`[generate-repose-single] Starting output ${outputId}, model: ${selectedModel}, imageSize: ${selectedImageSize || 'default'}`);

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

    // AI call succeeded! Mark as uploading and return 202 immediately
    // The response body reading happens in background to avoid timeout
    const { error: statusError } = await supabase
      .from('repose_outputs')
      .update({ status: 'uploading', heartbeat_at: new Date().toISOString() })
      .eq('id', outputId);
    
    if (statusError) {
      console.error(`[generate-repose-single] Failed to update status to uploading:`, statusError);
    }
    
    console.log(`[generate-repose-single] AI complete in ${elapsed}s, returning 202 and processing body in background`);
    
    // Start the background processing BEFORE returning the response
    // This ensures EdgeRuntime.waitUntil has been called before the response is sent
    const backgroundPromise = processResponseInBackground(supabase, outputId, output.batch_id, aiResponse, selectedImageSize);
    EdgeRuntime.waitUntil(backgroundPromise);
    
    // Return 202 Accepted immediately - body processing happens in background
    return new Response(
      JSON.stringify({ 
        success: true, 
        status: 'uploading',
        message: 'AI generation complete, processing response in background',
      }),
      { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

/**
 * Processes the AI response body in the background.
 * This is where we read the large base64 data and store it.
 */
async function processResponseInBackground(
  supabase: any,
  outputId: string,
  batchId: string,
  aiResponse: Response,
  imageSize: string | null
): Promise<void> {
  try {
    console.log(`[generate-repose-single:bg] Reading response body for ${outputId}`);
    
    // Read the response body (this can take time for 4K images)
    const responseText = await aiResponse.text();
    console.log(`[generate-repose-single:bg] Got ${Math.round(responseText.length / 1024)}KB response`);
    
    let aiResult;
    try {
      aiResult = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[generate-repose-single:bg] JSON parse error:', parseError);
      await supabase
        .from('repose_outputs')
        .update({ status: 'failed', error_message: 'Failed to parse AI response' })
        .eq('id', outputId);
      return;
    }
    
    // Check for embedded error
    const embeddedError = aiResult.choices?.[0]?.error;
    if (embeddedError) {
      const errorCode = embeddedError.code;
      const errorMessage = embeddedError.message || '';
      console.error('[generate-repose-single:bg] Embedded error:', errorCode, errorMessage.slice(0, 100));
      
      // Check for rate limit
      const allErrorText = `${errorCode} ${errorMessage}`.toLowerCase();
      if (allErrorText.includes('resource_exhausted') || allErrorText.includes('429') || allErrorText.includes('rate')) {
        await supabase
          .from('repose_outputs')
          .update({ status: 'queued' })
          .eq('id', outputId);
        return;
      }
      
      await supabase
        .from('repose_outputs')
        .update({ status: 'failed', error_message: `Embedded error: ${errorCode}` })
        .eq('id', outputId);
      return;
    }
    
    const generatedImageUrl = aiResult.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!generatedImageUrl) {
      console.error('[generate-repose-single:bg] No image in response');
      await supabase
        .from('repose_outputs')
        .update({ status: 'failed', error_message: 'No image generated' })
        .eq('id', outputId);
      return;
    }
    
    console.log(`[generate-repose-single:bg] Got image URL, length: ${generatedImageUrl.length} chars`);
    
    // Extract base64 data
    const base64Match = generatedImageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) {
      console.error('[generate-repose-single:bg] Invalid image format');
      await supabase
        .from('repose_outputs')
        .update({ status: 'failed', error_message: 'Invalid image format' })
        .eq('id', outputId);
      return;
    }
    
    const imageFormat = base64Match[1];
    const base64Data = base64Match[2];
    console.log(`[generate-repose-single:bg] Extracted base64: ${Math.round(base64Data.length / 1024)}KB`);
    
    // For 4K images, store to temp first then complete separately
    const is4K = imageSize === '4K';
    
    if (is4K) {
      // Store base64 to temp storage
      const tempPath = `temp/${outputId}.${imageFormat}.b64`;
      const base64Blob = new Blob([base64Data], { type: 'text/plain' });
      
      const { error: tempUploadError } = await supabase.storage
        .from('images')
        .upload(tempPath, base64Blob, {
          contentType: 'text/plain',
          upsert: true,
        });
      
      if (tempUploadError) {
        console.error('[generate-repose-single:bg] Temp upload error:', tempUploadError);
        await supabase
          .from('repose_outputs')
          .update({ status: 'queued', error_message: 'Temp upload failed, will retry' })
          .eq('id', outputId);
        return;
      }
      
      // Update with temp_path for complete-repose-upload to handle
      await supabase
        .from('repose_outputs')
        .update({ temp_path: tempPath })
        .eq('id', outputId);
      
      console.log(`[generate-repose-single:bg] 4K temp stored, will complete via separate function`);
      
      // Try to complete upload now
      await completeUploadFromTemp(supabase, outputId, batchId, base64Data, imageFormat, tempPath);
    } else {
      // For non-4K, upload directly
      await uploadImageDirectly(supabase, outputId, batchId, base64Data, imageFormat);
    }
    
  } catch (error) {
    console.error('[generate-repose-single:bg] Background processing failed:', error);
    // Leave in 'uploading' status - queue processor will handle via complete-repose-upload
  }
}

/**
 * Uploads image directly to storage (for non-4K images)
 */
async function uploadImageDirectly(
  supabase: any,
  outputId: string,
  batchId: string,
  base64Data: string,
  imageFormat: string
): Promise<void> {
  try {
    const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const fileName = `repose/${batchId}/${outputId}_${Date.now()}.${imageFormat}`;
    
    console.log(`[generate-repose-single:bg] Uploading ${imageBytes.length} bytes to ${fileName}`);
    
    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(fileName, imageBytes, {
        contentType: `image/${imageFormat}`,
        upsert: true,
      });

    if (uploadError) {
      console.error('[generate-repose-single:bg] Upload error:', uploadError);
      await supabase
        .from('repose_outputs')
        .update({ status: 'failed', error_message: 'Upload failed' })
        .eq('id', outputId);
      return;
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

    console.log(`[generate-repose-single:bg] Upload complete: ${publicUrl.publicUrl}`);
  } catch (error) {
    console.error('[generate-repose-single:bg] Direct upload failed:', error);
    await supabase
      .from('repose_outputs')
      .update({ status: 'failed', error_message: 'Upload exception' })
      .eq('id', outputId);
  }
}

/**
 * Completes upload from temp storage (for 4K images)
 */
async function completeUploadFromTemp(
  supabase: any,
  outputId: string,
  batchId: string,
  base64Data: string,
  imageFormat: string,
  tempPath: string
): Promise<void> {
  try {
    const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const fileName = `repose/${batchId}/${outputId}_${Date.now()}.${imageFormat}`;
    
    console.log(`[generate-repose-single:bg] 4K upload ${imageBytes.length} bytes to ${fileName}`);
    
    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(fileName, imageBytes, {
        contentType: `image/${imageFormat}`,
        upsert: true,
      });

    if (uploadError) {
      console.error('[generate-repose-single:bg] 4K upload error:', uploadError);
      // Leave in uploading with temp_path - complete-repose-upload will retry
      return;
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

    console.log(`[generate-repose-single:bg] 4K upload complete: ${publicUrl.publicUrl}`);
    
    // Clean up temp file
    await supabase.storage
      .from('images')
      .remove([tempPath]);
      
    console.log(`[generate-repose-single:bg] Cleaned up temp file`);
  } catch (error) {
    console.error('[generate-repose-single:bg] 4K upload failed:', error);
    // Leave in uploading with temp_path - complete-repose-upload will handle
  }
}
