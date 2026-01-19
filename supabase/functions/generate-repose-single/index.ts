import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const AI_TIMEOUT_MS = 55000; // 55 second timeout for AI calls

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
    const response = await withTimeout(
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
    console.log(`[generate-repose-single] AI response received in ${elapsed}s`);

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
    
    // Check for embedded error in response (API sometimes returns 200 with error in body)
    const embeddedError = aiResult.choices?.[0]?.error;
    if (embeddedError) {
      const errorCode = embeddedError.code;
      const rawError = typeof embeddedError.metadata?.raw === 'string' 
        ? embeddedError.metadata.raw 
        : JSON.stringify(embeddedError.metadata?.raw || '');
      const errorMessage = embeddedError.message || '';
      
      // Combine ALL error text fields to check for rate limit indicators
      const allErrorText = `${errorCode} ${errorMessage} ${rawError}`.toLowerCase();
      
      console.error('[generate-repose-single] Embedded error detected:', errorCode, 'message:', errorMessage.slice(0, 100), 'raw:', rawError.slice(0, 200));
      
      // Check for rate limit indicators in ANY of the error fields
      const isRateLimited = 
        errorCode === 429 || 
        errorCode === 502 || // Gateway errors often wrap rate limits
        errorCode === 503 ||
        allErrorText.includes('resource_exhausted') || 
        allErrorText.includes('429') ||
        allErrorText.includes('rate') ||
        allErrorText.includes('quota') ||
        allErrorText.includes('too many');
      
      if (isRateLimited) {
        console.log('[generate-repose-single] Rate limit detected, requeuing output');
        await supabase
          .from('repose_outputs')
          .update({ status: 'queued' })
          .eq('id', outputId);
        return new Response(
          JSON.stringify({ error: 'Rate limited (embedded)', retryable: true }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`Embedded error ${errorCode}: ${errorMessage.slice(0, 200)}`);
    }
    
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
