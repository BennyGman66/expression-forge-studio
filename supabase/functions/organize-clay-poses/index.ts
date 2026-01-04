import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simplified: just returns the list of images to organize
// The actual classification happens in organize-clay-single
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { brandId } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch product images for the brand
    let query = supabase
      .from("product_images")
      .select(`
        id,
        source_url,
        stored_url,
        slot,
        products!inner (
          id,
          brand_id
        )
      `);

    if (brandId) {
      query = query.eq("products.brand_id", brandId);
    }

    const { data: productImages, error: fetchError } = await query;

    if (fetchError) {
      console.error("Failed to fetch product images:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch product images" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!productImages || productImages.length === 0) {
      return new Response(
        JSON.stringify({ success: true, images: [], total: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return the list for client-side orchestration
    const images = productImages.map((img: any) => ({
      id: img.id,
      imageUrl: img.stored_url || img.source_url,
      currentSlot: img.slot,
    }));

    console.log(`Returning ${images.length} images for AVA organize`);

    return new Response(
      JSON.stringify({ success: true, images, total: images.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
