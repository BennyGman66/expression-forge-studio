import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ImageData {
  name: string;
  storagePath: string;
  viewType: 'front' | 'back';
  isCropped: boolean;
  base64Data: string; // Base64 encoded image data (without data: prefix)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { images } = await req.json() as { images: ImageData[] };
    
    if (!images || !Array.isArray(images) || images.length === 0) {
      return new Response(
        JSON.stringify({ error: 'images array is required with base64 data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[upload-crop-references] Starting upload of ${images.length} images`);
    
    const uploadedFiles: { path: string; url: string; viewType: string; isCropped: boolean }[] = [];
    const errors: string[] = [];
    
    // Upload each image to storage
    for (const img of images) {
      console.log(`[upload-crop-references] Processing: ${img.storagePath}`);
      
      try {
        // Decode base64 to Uint8Array
        const binaryString = atob(img.base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        // Upload to storage bucket
        const { data, error } = await supabase.storage
          .from('reference-crops')
          .upload(img.storagePath, bytes, {
            contentType: 'image/png',
            upsert: true
          });
        
        if (error) {
          errors.push(`Upload error for ${img.storagePath}: ${error.message}`);
          continue;
        }
        
        // Get public URL
        const { data: urlData } = supabase.storage
          .from('reference-crops')
          .getPublicUrl(img.storagePath);
        
        uploadedFiles.push({ 
          path: img.storagePath, 
          url: urlData.publicUrl,
          viewType: img.viewType,
          isCropped: img.isCropped
        });
        console.log(`[upload-crop-references] Uploaded: ${img.storagePath} -> ${urlData.publicUrl}`);
      } catch (err) {
        errors.push(`Error processing ${img.storagePath}: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    }
    
    // Clear existing entries
    console.log(`[upload-crop-references] Clearing existing crop_reference_images...`);
    await supabase.from('crop_reference_images').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    // Group uploaded files by view type and pair number
    const frontOriginals = uploadedFiles.filter(f => f.viewType === 'front' && !f.isCropped);
    const frontCropped = uploadedFiles.filter(f => f.viewType === 'front' && f.isCropped);
    const backOriginals = uploadedFiles.filter(f => f.viewType === 'back' && !f.isCropped);
    const backCropped = uploadedFiles.filter(f => f.viewType === 'back' && f.isCropped);
    
    // Create reference pairs
    const createPairs = async (originals: typeof uploadedFiles, cropped: typeof uploadedFiles, viewType: string) => {
      for (let i = 0; i < Math.min(originals.length, cropped.length); i++) {
        const original = originals[i];
        const crop = cropped[i];
        
        const { error } = await supabase.from('crop_reference_images').insert({
          name: `${viewType === 'front' ? 'Front' : 'Back'} View Example ${i + 1}`,
          original_image_url: original.url,
          cropped_image_url: crop.url,
          view_type: viewType,
          is_active: true,
          description: `Reference crop for ${viewType} view images`
        });
        
        if (error) {
          console.error(`[upload-crop-references] Failed to insert pair:`, error);
        } else {
          console.log(`[upload-crop-references] Created reference pair: ${viewType} ${i + 1}`);
        }
      }
    };
    
    await createPairs(frontOriginals, frontCropped, 'front');
    await createPairs(backOriginals, backCropped, 'back');
    
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
