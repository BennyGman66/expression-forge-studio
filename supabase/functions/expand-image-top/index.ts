import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExpandRequest {
  imageUrl: string;
  imageId: string;
  paddingPercent?: number; // Default 10%
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl, imageId, paddingPercent = 10 } = (await req.json()) as ExpandRequest;

    console.log(`Expanding image: ${imageUrl}`);
    console.log(`Image ID: ${imageId}, Padding: ${paddingPercent}%`);

    // Fetch the original image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
    }

    const imageBytes = new Uint8Array(await imageResponse.arrayBuffer());
    console.log(`Fetched image: ${imageBytes.length} bytes`);

    // Decode image
    const image = await Image.decode(imageBytes);
    console.log(`Original dimensions: ${image.width}x${image.height}`);

    // Resize down if the image is too large to prevent memory issues
    const MAX_DIMENSION = 2000;
    let processImage = image;

    if (image.width > MAX_DIMENSION || image.height > MAX_DIMENSION) {
      if (image.width > image.height) {
        processImage = image.resize(MAX_DIMENSION, Image.RESIZE_AUTO);
      } else {
        processImage = image.resize(Image.RESIZE_AUTO, MAX_DIMENSION);
      }
      console.log(`Resized to: ${processImage.width}x${processImage.height}`);
    }

    // Calculate padding height (10% of height by default)
    const paddingHeight = Math.round(processImage.height * (paddingPercent / 100));
    const newHeight = processImage.height + paddingHeight;

    console.log(`Adding ${paddingHeight}px white padding to top. New height: ${newHeight}`);

    // Create new expanded canvas with white background
    const expandedImage = new Image(processImage.width, newHeight);
    expandedImage.fill(0xFFFFFFFF); // Fill entire canvas with white efficiently

    // Composite original image at the bottom (below the white padding)
    expandedImage.composite(processImage, 0, paddingHeight);

    console.log(`Expanded image: ${expandedImage.width}x${expandedImage.height}`);

    // Encode to PNG
    const outputBytes = await expandedImage.encode();
    console.log(`Encoded output: ${outputBytes.length} bytes`);

    // Upload to Supabase storage
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const fileName = `expanded/${imageId}-${Date.now()}.png`;

    const { error: uploadError } = await supabase.storage
      .from("face-crops")
      .upload(fileName, outputBytes, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from("face-crops")
      .getPublicUrl(fileName);

    console.log(`Uploaded to: ${publicUrl}`);

    // Update the look_source_images table with new source_url
    const { error: updateError } = await supabase
      .from("look_source_images")
      .update({ source_url: publicUrl })
      .eq("id", imageId);

    if (updateError) {
      throw new Error(`Database update failed: ${updateError.message}`);
    }

    console.log(`Updated database for image ${imageId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        expandedUrl: publicUrl,
        originalHeight: image.height,
        newHeight: newHeight,
        paddingAdded: paddingHeight
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error expanding image:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
