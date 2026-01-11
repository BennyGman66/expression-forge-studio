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
    const body = await req.json();
    const { originalFilename, projectId, tiffStoragePath, fileBase64 } = body;

    if (!originalFilename || !projectId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: originalFilename, projectId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Must have either tiffStoragePath (new) or fileBase64 (legacy)
    if (!tiffStoragePath && !fileBase64) {
      return new Response(
        JSON.stringify({ error: "Missing required field: tiffStoragePath or fileBase64" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Converting TIFF: ${originalFilename} for project ${projectId}`);
    console.log(`Mode: ${tiffStoragePath ? 'storage-path' : 'base64-legacy'}`);

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let tempTiffPath: string;
    let tiffUrl: string;

    if (tiffStoragePath) {
      // NEW PATH: TIFF already in storage, just get URL
      tempTiffPath = tiffStoragePath;
      const { data: tiffUrlData } = supabase.storage
        .from("images")
        .getPublicUrl(tiffStoragePath);
      tiffUrl = tiffUrlData.publicUrl;
      console.log(`Using existing TIFF at: ${tiffUrl}`);
    } else {
      // LEGACY PATH: Decode base64 and upload (memory-intensive, may fail on large files)
      console.log("Using legacy base64 path - may fail on large files");
      
      const binaryString = atob(fileBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 8);
      tempTiffPath = `face-application/${projectId}/temp/${timestamp}-${randomId}-${originalFilename}`;

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

      const { data: tiffUrlData } = supabase.storage
        .from("images")
        .getPublicUrl(tempTiffPath);
      tiffUrl = tiffUrlData.publicUrl;
      console.log(`TIFF uploaded to: ${tiffUrl}`);
    }

    // Use wsrv.nl for TIFF to PNG conversion (handles large files)
    const wsrvUrl = `https://wsrv.nl/?url=${encodeURIComponent(tiffUrl)}&output=png&q=100`;
    console.log(`Fetching converted PNG from wsrv.nl...`);

    const pngResponse = await fetch(wsrvUrl);
    
    if (!pngResponse.ok) {
      // Try Cloudinary as fallback
      console.log("wsrv.nl failed, trying Cloudinary fallback...");
      const cloudinaryUrl = `https://res.cloudinary.com/demo/image/fetch/f_png,q_100/${encodeURIComponent(tiffUrl)}`;
      
      const cloudinaryResponse = await fetch(cloudinaryUrl);
      
      if (!cloudinaryResponse.ok) {
        throw new Error(`All conversion methods failed. wsrv.nl: ${pngResponse.status}, Cloudinary: ${cloudinaryResponse.status}`);
      }
      
      const pngBuffer = await cloudinaryResponse.arrayBuffer();
      return await finalizePng(supabase, pngBuffer, originalFilename, projectId, tempTiffPath);
    }

    const pngBuffer = await pngResponse.arrayBuffer();
    console.log(`Received PNG: ${pngBuffer.byteLength} bytes`);

    return await finalizePng(supabase, pngBuffer, originalFilename, projectId, tempTiffPath);

  } catch (error: unknown) {
    console.error("Conversion error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: `Conversion failed: ${message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Helper to finalize PNG upload and cleanup
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function finalizePng(
  supabase: any,
  pngBuffer: ArrayBuffer,
  originalFilename: string,
  projectId: string,
  tempTiffPath: string
) {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  const pngFilename = originalFilename.replace(/\.tiff?$/i, ".png");
  const storagePath = `face-application/${projectId}/converted/${timestamp}-${randomId}-${pngFilename}`;

  // Upload the converted PNG
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
  console.log(`Cleaning up temp TIFF: ${tempTiffPath}`);
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
      convertedSize: pngBuffer.byteLength,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
