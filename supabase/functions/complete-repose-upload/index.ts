import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Complete a repose upload that was started in generate-repose-single but timed out.
 * Fetches base64 from temp storage, decodes it, uploads to final location, and updates status.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { outputId } = await req.json();

    if (!outputId) {
      return new Response(
        JSON.stringify({ error: 'outputId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[complete-repose-upload] Processing output ${outputId}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the output record
    const { data: output, error: outputError } = await supabase
      .from('repose_outputs')
      .select('id, batch_id, status, temp_path')
      .eq('id', outputId)
      .single();

    if (outputError || !output) {
      console.error('[complete-repose-upload] Output not found:', outputError);
      return new Response(
        JSON.stringify({ error: 'Output not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Skip if not in uploading status or no temp_path
    if (output.status !== 'uploading') {
      console.log(`[complete-repose-upload] Output ${outputId} is not in uploading status (${output.status}), skipping`);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: `status is ${output.status}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!output.temp_path) {
      console.error('[complete-repose-upload] No temp_path for output:', outputId);
      // Reset to queued so it can be regenerated
      await supabase
        .from('repose_outputs')
        .update({ status: 'queued', error_message: 'No temp data, regenerating' })
        .eq('id', outputId);
      return new Response(
        JSON.stringify({ success: false, error: 'No temp_path, reset to queued' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[complete-repose-upload] Downloading temp file from ${output.temp_path}`);

    // Download the base64 from temp storage
    const { data: tempData, error: downloadError } = await supabase.storage
      .from('images')
      .download(output.temp_path);

    if (downloadError || !tempData) {
      console.error('[complete-repose-upload] Failed to download temp file:', downloadError);
      // Reset to queued so it can be regenerated
      await supabase
        .from('repose_outputs')
        .update({ status: 'queued', error_message: 'Temp file missing, regenerating' })
        .eq('id', outputId);
      return new Response(
        JSON.stringify({ success: false, error: 'Temp file missing, reset to queued' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Read the base64 string from the temp file
    const base64Data = await tempData.text();
    console.log(`[complete-repose-upload] Downloaded ${base64Data.length} chars of base64`);

    // Determine image format from temp_path (e.g., temp/xxx.png.b64 -> png)
    const formatMatch = output.temp_path.match(/\.(\w+)\.b64$/);
    const imageFormat = formatMatch ? formatMatch[1] : 'png';

    // Decode base64 to bytes - do this in chunks to avoid memory issues
    console.log(`[complete-repose-upload] Decoding base64 (format: ${imageFormat})`);
    const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    console.log(`[complete-repose-upload] Decoded to ${imageBytes.length} bytes`);

    // Upload to final location
    const fileName = `repose/${output.batch_id}/${outputId}_${Date.now()}.${imageFormat}`;
    console.log(`[complete-repose-upload] Uploading to ${fileName}`);

    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(fileName, imageBytes, {
        contentType: `image/${imageFormat}`,
        upsert: true,
      });

    if (uploadError) {
      console.error('[complete-repose-upload] Upload error:', uploadError);
      // Don't fail completely - leave in uploading status for retry
      return new Response(
        JSON.stringify({ success: false, error: 'Upload failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get public URL
    const { data: publicUrl } = supabase.storage
      .from('images')
      .getPublicUrl(fileName);

    // Update output with result
    await supabase
      .from('repose_outputs')
      .update({
        status: 'complete',
        result_url: publicUrl.publicUrl,
        error_message: null,
        temp_path: null, // Clear temp reference
      })
      .eq('id', outputId);

    // Clean up temp file (don't await - fire and forget)
    supabase.storage
      .from('images')
      .remove([output.temp_path])
      .then(({ error }) => {
        if (error) {
          console.warn(`[complete-repose-upload] Failed to delete temp file: ${error.message}`);
        } else {
          console.log(`[complete-repose-upload] Cleaned up temp file`);
        }
      });

    console.log(`[complete-repose-upload] Completed upload for ${outputId}: ${publicUrl.publicUrl}`);

    return new Response(
      JSON.stringify({
        success: true,
        resultUrl: publicUrl.publicUrl,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[complete-repose-upload] Error:', errorMessage);

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
