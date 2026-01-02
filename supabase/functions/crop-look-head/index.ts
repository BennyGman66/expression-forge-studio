import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CropRequest {
  imageUrl: string;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  outputSize: number;
  imageId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl, cropX, cropY, cropWidth, cropHeight, outputSize, imageId }: CropRequest = await req.json();

    console.log(`Processing crop for image ${imageId}: ${cropWidth}x${cropHeight} at (${cropX}, ${cropY})`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch the original image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status}`);
    }

    const imageBlob = await imageResponse.blob();
    const imageBuffer = await imageBlob.arrayBuffer();
    const imageData = new Uint8Array(imageBuffer);

    // Get image dimensions from header
    const dimensions = getImageDimensions(imageData);
    if (!dimensions) {
      throw new Error("Could not determine image dimensions");
    }

    console.log(`Original image: ${dimensions.width}x${dimensions.height}`);

    // Calculate the final output composition:
    // - The cropped head region is placed at the bottom
    // - Empty space (white) fills above to reach outputSize x outputSize
    
    // For now, we'll use a simpler approach: 
    // Call the AI image generation to create the padded version
    // OR use canvas-like processing
    
    // Since Deno doesn't have native canvas, we'll use a different approach:
    // Use the Lovable AI to inpaint/extend the image
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // For V1, let's create a simple cropped version without padding
    // and handle the padding on the client side or via AI later
    
    // Use the existing crop-and-store-image logic
    const cropResponse = await supabase.functions.invoke("crop-and-store-image", {
      body: {
        imageUrl,
        cropX: cropX / dimensions.width * 100, // Convert to percentage
        cropY: cropY / dimensions.height * 100,
        cropWidth: cropWidth / dimensions.width * 100,
        cropHeight: cropHeight / dimensions.height * 100,
        cropId: `look-head-${imageId}`,
      },
    });

    if (cropResponse.error) {
      throw cropResponse.error;
    }

    const croppedUrl = cropResponse.data?.croppedUrl;

    if (!croppedUrl) {
      throw new Error("No cropped URL returned");
    }

    console.log(`Cropped image saved: ${croppedUrl}`);

    return new Response(
      JSON.stringify({ croppedUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in crop-look-head:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getImageDimensions(data: Uint8Array): { width: number; height: number } | null {
  // PNG
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    const width = (data[16] << 24) | (data[17] << 16) | (data[18] << 8) | data[19];
    const height = (data[20] << 24) | (data[21] << 16) | (data[22] << 8) | data[23];
    return { width, height };
  }

  // JPEG
  if (data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2;
    while (offset < data.length) {
      if (data[offset] !== 0xff) break;
      const marker = data[offset + 1];
      if (marker === 0xc0 || marker === 0xc2) {
        const height = (data[offset + 5] << 8) | data[offset + 6];
        const width = (data[offset + 7] << 8) | data[offset + 8];
        return { width, height };
      }
      const length = (data[offset + 2] << 8) | data[offset + 3];
      offset += 2 + length;
    }
  }

  // WebP
  if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46) {
    if (data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) {
      // VP8
      if (data[12] === 0x56 && data[13] === 0x50 && data[14] === 0x38 && data[15] === 0x20) {
        const width = ((data[26] | (data[27] << 8)) & 0x3fff);
        const height = ((data[28] | (data[29] << 8)) & 0x3fff);
        return { width, height };
      }
    }
  }

  return null;
}
