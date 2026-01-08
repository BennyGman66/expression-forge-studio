import "https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileBase64, originalFilename, projectId } = await req.json();

    if (!fileBase64 || !originalFilename || !projectId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: fileBase64, originalFilename, projectId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Converting TIFF: ${originalFilename} for project ${projectId}`);

    // Decode base64 to binary
    const binaryString = atob(fileBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // First upload the TIFF to storage temporarily
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const tempTiffPath = `face-application/${projectId}/temp/${timestamp}-${randomId}-${originalFilename}`;

    const { error: tiffUploadError } = await supabase.storage
      .from("images")
      .upload(tempTiffPath, bytes, {
        contentType: "image/tiff",
        upsert: false,
      });

    if (tiffUploadError) {
      console.error("TIFF upload error:", tiffUploadError);
      return new Response(
        JSON.stringify({ error: `TIFF upload failed: ${tiffUploadError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the TIFF URL
    const { data: tiffUrlData } = supabase.storage
      .from("images")
      .getPublicUrl(tempTiffPath);

    const tiffUrl = tiffUrlData.publicUrl;
    console.log(`TIFF uploaded to: ${tiffUrl}`);

    // Use Cloudinary's fetch API for TIFF to PNG conversion
    // This is a free tier feature that works without authentication for public URLs
    // Format: https://res.cloudinary.com/demo/image/fetch/f_png/{url}
    const cloudinaryConvertUrl = `https://res.cloudinary.com/demo/image/fetch/f_png,q_100/${encodeURIComponent(tiffUrl)}`;

    console.log(`Fetching converted PNG from Cloudinary...`);

    // Fetch the converted PNG from Cloudinary
    const pngResponse = await fetch(cloudinaryConvertUrl);
    
    if (!pngResponse.ok) {
      // Cloudinary demo might not work - fall back to storing TIFF and letting browser handle it
      console.log("Cloudinary conversion failed, using alternative approach");
      
      // For TIFF files, we'll use an image processing service
      // Try using imgproxy or similar if available, otherwise store as-is
      // The browser can still display many TIFFs via canvas
      
      // Generate PNG filename and final storage path
      const pngFilename = originalFilename.replace(/\.tiff?$/i, ".png");
      const finalPath = `face-application/${projectId}/converted/${timestamp}-${randomId}-${pngFilename}`;

      // Move the TIFF to final location with PNG extension (browser will need to handle)
      // Actually, let's try a different free conversion service
      const convertioUrl = `https://wsrv.nl/?url=${encodeURIComponent(tiffUrl)}&output=png&q=100`;
      
      const wsrvResponse = await fetch(convertioUrl);
      
      if (wsrvResponse.ok) {
        const pngBuffer = await wsrvResponse.arrayBuffer();
        
        // Upload the converted PNG
        const { error: pngUploadError } = await supabase.storage
          .from("images")
          .upload(finalPath, new Uint8Array(pngBuffer), {
            contentType: "image/png",
            upsert: false,
          });

        if (pngUploadError) {
          throw new Error(`PNG upload failed: ${pngUploadError.message}`);
        }

        // Delete the temp TIFF
        await supabase.storage.from("images").remove([tempTiffPath]);

        // Get public URL
        const { data: urlData } = supabase.storage
          .from("images")
          .getPublicUrl(finalPath);

        return new Response(
          JSON.stringify({
            success: true,
            pngUrl: urlData.publicUrl,
            originalFilename,
            pngFilename,
            storagePath: finalPath,
            originalSize: bytes.length,
            convertedSize: pngBuffer.byteLength,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // If all conversion fails, return error
      throw new Error("All conversion methods failed. TIFF format may not be supported.");
    }

    const pngBuffer = await pngResponse.arrayBuffer();
    console.log(`Received PNG: ${pngBuffer.byteLength} bytes`);

    // Generate PNG filename and storage path
    const pngFilename = originalFilename.replace(/\.tiff?$/i, ".png");
    const storagePath = `face-application/${projectId}/converted/${timestamp}-${randomId}-${pngFilename}`;

    // Upload the converted PNG to Supabase storage
    const { error: uploadError } = await supabase.storage
      .from("images")
      .upload(storagePath, new Uint8Array(pngBuffer), {
        contentType: "image/png",
        upsert: false,
      });

    if (uploadError) {
      console.error("PNG upload error:", uploadError);
      return new Response(
        JSON.stringify({ error: `PNG upload failed: ${uploadError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete the temporary TIFF file
    await supabase.storage.from("images").remove([tempTiffPath]);

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("images")
      .getPublicUrl(storagePath);

    console.log(`Uploaded PNG to: ${urlData.publicUrl}`);

    return new Response(
      JSON.stringify({
        success: true,
        pngUrl: urlData.publicUrl,
        originalFilename,
        pngFilename,
        storagePath,
        originalSize: bytes.length,
        convertedSize: pngBuffer.byteLength,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Conversion error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: `Conversion failed: ${message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
