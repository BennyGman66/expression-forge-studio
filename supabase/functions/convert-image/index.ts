import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ConvertRequest {
  sourceUrl: string;
  targetFormat: "png" | "jpeg" | "webp";
  targetPath: string;
  quality?: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { sourceUrl, targetFormat, targetPath, quality = 90 }: ConvertRequest = await req.json();

    if (!sourceUrl || !targetFormat || !targetPath) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters: sourceUrl, targetFormat, targetPath" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Converting image: ${sourceUrl} to ${targetFormat}`);

    // Map format to wsrv.nl output parameter
    const formatMap: Record<string, string> = {
      png: "png",
      jpeg: "jpg",
      webp: "webp",
    };

    const outputFormat = formatMap[targetFormat];
    if (!outputFormat) {
      return new Response(
        JSON.stringify({ error: `Unsupported format: ${targetFormat}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use wsrv.nl for image conversion
    // This service handles TIFF, PNG, JPEG, WebP and can convert between them
    const wsrvUrl = `https://wsrv.nl/?url=${encodeURIComponent(sourceUrl)}&output=${outputFormat}&q=${quality}`;

    console.log(`Fetching from wsrv.nl: ${wsrvUrl}`);

    const response = await fetch(wsrvUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`wsrv.nl conversion failed: ${response.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ error: `Conversion failed: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const imageBuffer = await response.arrayBuffer();
    console.log(`Converted image size: ${imageBuffer.byteLength} bytes`);

    // Determine content type
    const contentTypeMap: Record<string, string> = {
      png: "image/png",
      jpeg: "image/jpeg",
      webp: "image/webp",
    };

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("workflow-assets")
      .upload(targetPath, imageBuffer, {
        contentType: contentTypeMap[targetFormat],
        upsert: true,
      });

    if (uploadError) {
      console.error(`Storage upload failed: ${uploadError.message}`);
      return new Response(
        JSON.stringify({ error: `Storage upload failed: ${uploadError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from("workflow-assets")
      .getPublicUrl(targetPath);

    console.log(`Conversion complete. Stored at: ${urlData.publicUrl}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        convertedUrl: urlData.publicUrl,
        format: targetFormat,
        size: imageBuffer.byteLength,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error(`Conversion error: ${errorMessage}`);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
