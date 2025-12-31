import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Reference images configuration - maps local paths to storage paths
const referenceConfigs = [
  { localPath: 'front/original-1.png', storagePath: 'front/original-1.png', viewType: 'front', name: 'Front Example 1 - Original' },
  { localPath: 'front/cropped-1.png', storagePath: 'front/cropped-1.png', viewType: 'front', name: 'Front Example 1 - Cropped', isCropped: true },
  { localPath: 'front/original-2.png', storagePath: 'front/original-2.png', viewType: 'front', name: 'Front Example 2 - Original' },
  { localPath: 'front/cropped-2.png', storagePath: 'front/cropped-2.png', viewType: 'front', name: 'Front Example 2 - Cropped', isCropped: true },
  { localPath: 'front/original-3.png', storagePath: 'front/original-3.png', viewType: 'front', name: 'Front Example 3 - Original' },
  { localPath: 'front/cropped-3.png', storagePath: 'front/cropped-3.png', viewType: 'front', name: 'Front Example 3 - Cropped', isCropped: true },
  { localPath: 'front/original-4.png', storagePath: 'front/original-4.png', viewType: 'front', name: 'Front Example 4 - Original' },
  { localPath: 'front/cropped-4.png', storagePath: 'front/cropped-4.png', viewType: 'front', name: 'Front Example 4 - Cropped', isCropped: true },
  { localPath: 'back/original-1.png', storagePath: 'back/original-1.png', viewType: 'back', name: 'Back Example 1 - Original' },
  { localPath: 'back/cropped-1.png', storagePath: 'back/cropped-1.png', viewType: 'back', name: 'Back Example 1 - Cropped', isCropped: true },
  { localPath: 'back/original-2.png', storagePath: 'back/original-2.png', viewType: 'back', name: 'Back Example 2 - Original' },
  { localPath: 'back/cropped-2.png', storagePath: 'back/cropped-2.png', viewType: 'back', name: 'Back Example 2 - Cropped', isCropped: true },
  { localPath: 'back/original-3.png', storagePath: 'back/original-3.png', viewType: 'back', name: 'Back Example 3 - Original' },
  { localPath: 'back/cropped-3.png', storagePath: 'back/cropped-3.png', viewType: 'back', name: 'Back Example 3 - Cropped', isCropped: true },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sourceBaseUrl } = await req.json();
    
    if (!sourceBaseUrl) {
      return new Response(
        JSON.stringify({ error: 'sourceBaseUrl is required (e.g., https://your-app.lovableproject.com)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[upload-crop-references] Starting upload from ${sourceBaseUrl}`);
    
    const uploadedFiles: { path: string; url: string }[] = [];
    const errors: string[] = [];
    
    // Upload each reference image to storage
    for (const config of referenceConfigs) {
      const sourceUrl = `${sourceBaseUrl}/reference-crops/${config.localPath}`;
      console.log(`[upload-crop-references] Fetching: ${sourceUrl}`);
      
      try {
        const response = await fetch(sourceUrl);
        if (!response.ok) {
          errors.push(`Failed to fetch ${config.localPath}: ${response.status}`);
          continue;
        }
        
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // Upload to storage bucket
        const { data, error } = await supabase.storage
          .from('reference-crops')
          .upload(config.storagePath, uint8Array, {
            contentType: 'image/png',
            upsert: true
          });
        
        if (error) {
          errors.push(`Upload error for ${config.localPath}: ${error.message}`);
          continue;
        }
        
        // Get public URL
        const { data: urlData } = supabase.storage
          .from('reference-crops')
          .getPublicUrl(config.storagePath);
        
        uploadedFiles.push({ path: config.storagePath, url: urlData.publicUrl });
        console.log(`[upload-crop-references] Uploaded: ${config.storagePath} -> ${urlData.publicUrl}`);
      } catch (err) {
        errors.push(`Error processing ${config.localPath}: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    }
    
    // Now update the crop_reference_images table with the new URLs
    // First, clear existing entries
    await supabase.from('crop_reference_images').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    // Build pairs of original + cropped images
    const pairs = [
      { view: 'front', pairs: [1, 2, 3, 4] },
      { view: 'back', pairs: [1, 2, 3] },
    ];
    
    for (const group of pairs) {
      for (const pairNum of group.pairs) {
        const originalUrl = uploadedFiles.find(f => f.path === `${group.view}/original-${pairNum}.png`)?.url;
        const croppedUrl = uploadedFiles.find(f => f.path === `${group.view}/cropped-${pairNum}.png`)?.url;
        
        if (originalUrl && croppedUrl) {
          await supabase.from('crop_reference_images').insert({
            name: `${group.view === 'front' ? 'Front' : 'Back'} View Example ${pairNum}`,
            original_image_url: originalUrl,
            cropped_image_url: croppedUrl,
            view_type: group.view,
            is_active: true,
            description: `Reference crop for ${group.view} view images`
          });
          console.log(`[upload-crop-references] Created reference pair: ${group.view} ${pairNum}`);
        }
      }
    }
    
    console.log(`[upload-crop-references] Complete. Uploaded: ${uploadedFiles.length}, Errors: ${errors.length}`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        uploaded: uploadedFiles.length,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('[upload-crop-references] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
