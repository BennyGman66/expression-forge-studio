import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CropRequest {
  imageUrl: string;
  cropX: number;      // percentage 0-100 (or pixels if usePixelCoords is true)
  cropY: number;      // percentage 0-100 (or pixels if usePixelCoords is true)
  cropWidth: number;  // percentage 0-100 (or pixels if usePixelCoords is true)
  cropHeight: number; // percentage 0-100 (or pixels if usePixelCoords is true)
  cropId: string;     // UUID for naming the file
  targetSize?: number; // Optional target output size (e.g., 1000 for 1000x1000)
  mode?: 'bottom-half'; // If set, the cropped content goes in the bottom half with white padding above
  usePixelCoords?: boolean; // If true, crop values are pixels, not percentages
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl, cropX, cropY, cropWidth, cropHeight, cropId, targetSize, mode, usePixelCoords } = await req.json() as CropRequest;

    console.log(`Cropping image: ${imageUrl}`);
    console.log(`Crop params: x=${cropX}, y=${cropY}, w=${cropWidth}, h=${cropHeight} (${usePixelCoords ? 'pixels' : 'percentages'})`);
    console.log(`Mode: ${mode || 'standard'}, Target size: ${targetSize || 'none'}`);

    // Fetch the original image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status}`);
    }

    const imageBlob = await imageResponse.blob();
    const imageBuffer = await imageBlob.arrayBuffer();
    const imageBytes = new Uint8Array(imageBuffer);

    // Decode image to get dimensions
    const dimensions = getImageDimensions(imageBytes);
    if (!dimensions) {
      throw new Error('Could not determine image dimensions');
    }

    console.log(`Original image dimensions: ${dimensions.width}x${dimensions.height}`);

    // Calculate pixel coordinates - either use directly or convert from percentages
    let pixelX: number, pixelY: number, pixelWidth: number, pixelHeight: number;
    
    if (usePixelCoords) {
      // Use coordinates directly as pixels
      pixelX = Math.round(cropX);
      pixelY = Math.round(cropY);
      pixelWidth = Math.round(cropWidth);
      pixelHeight = Math.round(cropHeight);
    } else {
      // Convert from percentages to pixels
      pixelX = Math.round(dimensions.width * (cropX / 100));
      pixelY = Math.round(dimensions.height * (cropY / 100));
      pixelWidth = Math.round(dimensions.width * (cropWidth / 100));
      pixelHeight = Math.round(dimensions.height * (cropHeight / 100));
    }

    console.log(`Crop pixels: x=${pixelX}, y=${pixelY}, w=${pixelWidth}, h=${pixelHeight}`);

    // Use imagescript for image processing
    const { Image } = await import("https://deno.land/x/imagescript@1.3.0/mod.ts");
    
    const image = await Image.decode(imageBytes);
    
    // Ensure crop bounds are within image
    const safeX = Math.max(0, Math.min(pixelX, image.width - 1));
    const safeY = Math.max(0, Math.min(pixelY, image.height - 1));
    const safeWidth = Math.min(pixelWidth, image.width - safeX);
    const safeHeight = Math.min(pixelHeight, image.height - safeY);

    console.log(`Safe crop: x=${safeX}, y=${safeY}, w=${safeWidth}, h=${safeHeight}`);

    let outputImage;

    if (mode === 'bottom-half' && targetSize) {
      // TWO-STEP PROCESS:
      // 1. Crop the EXACT green box selection (no scaling)
      // 2. Enlarge to fill the 1000x1000 output
      
      console.log(`Bottom-half mode: crop exact selection, then enlarge to fill`);
      
      // Step 1: Crop the exact selection - no modification
      const croppedSelection = image.crop(safeX, safeY, safeWidth, safeHeight);
      console.log(`Step 1 - Exact crop: ${croppedSelection.width}x${croppedSelection.height}`);
      
      // Step 2: Enlarge to fill target size (1000x1000), preserving aspect ratio
      const enlargedSelection = croppedSelection.fit(targetSize, targetSize);
      console.log(`Step 2 - Enlarged to: ${enlargedSelection.width}x${enlargedSelection.height}`);
      
      // Step 3: Create output canvas with white background
      outputImage = new Image(targetSize, targetSize);
      outputImage.fill(0xFFFFFFFF); // White
      console.log(`Step 3 - Canvas: ${outputImage.width}x${outputImage.height}`);
      
      // Step 4: Center the enlarged selection on the canvas
      const offsetX = Math.floor((targetSize - enlargedSelection.width) / 2);
      const offsetY = Math.floor((targetSize - enlargedSelection.height) / 2);
      outputImage.composite(enlargedSelection, offsetX, offsetY);
      
      console.log(`Step 4 - Centered at: x=${offsetX}, y=${offsetY}`);
    } else {
      // Standard mode: crop and optionally resize with aspect ratio preservation
      const croppedImage = image.crop(safeX, safeY, safeWidth, safeHeight);
      
      if (targetSize) {
        // Preserve aspect ratio: fit into targetSize x targetSize, then center on white canvas
        const fittedImage = croppedImage.fit(targetSize, targetSize);
        outputImage = new Image(targetSize, targetSize);
        outputImage.fill(0xFFFFFFFF); // White background
        const offsetX = Math.floor((targetSize - fittedImage.width) / 2);
        const offsetY = Math.floor((targetSize - fittedImage.height) / 2);
        outputImage.composite(fittedImage, offsetX, offsetY);
        console.log(`Standard mode with fit: ${fittedImage.width}x${fittedImage.height} centered at (${offsetX}, ${offsetY})`);
      } else {
        outputImage = croppedImage;
      }
    }
    
    // Encode as PNG
    const croppedBytes = await outputImage.encode();

    // Upload to Supabase storage
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const filePath = `cropped-faces/${cropId}.png`;
    
    const { error: uploadError } = await supabase.storage
      .from('face-crops')
      .upload(filePath, croppedBytes, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Failed to upload cropped image: ${uploadError.message}`);
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('face-crops')
      .getPublicUrl(filePath);

    const croppedUrl = publicUrlData.publicUrl;
    console.log(`Cropped image uploaded: ${croppedUrl}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        croppedUrl,
        dimensions: {
          original: { width: dimensions.width, height: dimensions.height },
          cropped: { width: outputImage.width, height: outputImage.height }
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error cropping image:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper function to get image dimensions from PNG/JPEG headers
function getImageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  // Check for PNG signature
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    // PNG: dimensions are in IHDR chunk at bytes 16-23
    const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    return { width, height };
  }
  
  // Check for JPEG signature
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
    // JPEG: need to find SOF0/SOF2 marker
    let offset = 2;
    while (offset < bytes.length - 8) {
      if (bytes[offset] !== 0xFF) {
        offset++;
        continue;
      }
      const marker = bytes[offset + 1];
      // SOF0, SOF1, SOF2 markers
      if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
        const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
        const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
        return { width, height };
      }
      // Skip to next marker
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      offset += 2 + length;
    }
  }

  // Check for WebP signature
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    // WebP: VP8 chunk contains dimensions
    // This is a simplified check - full WebP parsing is more complex
    if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x20) {
      // VP8 lossy
      const width = ((bytes[26] | (bytes[27] << 8)) & 0x3FFF);
      const height = ((bytes[28] | (bytes[29] << 8)) & 0x3FFF);
      return { width, height };
    }
  }

  return null;
}
