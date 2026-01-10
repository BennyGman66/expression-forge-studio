import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Pairing {
  view: string;
  talentImageUrl: string;
  talentImageId: string;
  slots: string[];
  productType?: 'tops' | 'bottoms' | null;
  lookId?: string;
  lookName?: string;
  talentName?: string;
}

interface ClayImageWithMeta {
  id: string;
  stored_url: string;
  product_images: {
    slot: string;
    products: {
      brand_id: string;
      gender: string;
      product_type: string;
    };
  };
}

interface GenerationTask {
  talentImageUrl: string;
  talentImageId: string;
  view: string;
  slot: string;
  poseId: string;
  poseUrl: string;
  attempt: number;
  lookId?: string;
}

// Helper function to verify authentication
async function verifyAuth(req: Request): Promise<{ userId: string | null; error: Response | null }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      userId: null,
      error: new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const token = authHeader.replace('Bearer ', '');
  const { data, error } = await supabase.auth.getClaims(token);
  
  if (error || !data?.claims) {
    return {
      userId: null,
      error: new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    };
  }

  return { userId: data.claims.sub as string, error: null };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const { userId, error: authError } = await verifyAuth(req);
    if (authError) {
      return authError;
    }
    console.log(`Authenticated user: ${userId}`);

    const body = await req.json();
    const {
      brandId,
      talentId,
      pairings,
      gender,
      randomCount,
      attemptsPerPose,
      bulkMode,
      model,
      // Legacy single-mode params
      talentImageUrl,
      view,
      slot,
    } = body;

    // Default to Flash model if not specified
    const selectedModel = model || "google/gemini-2.5-flash-image-preview";

    if (!brandId || !talentId) {
      return new Response(
        JSON.stringify({ error: "brandId and talentId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all clay images for this brand with product_type
    const { data: clayImagesData, error: clayError } = await supabase
      .from("clay_images")
      .select("*, product_images!inner(slot, products!inner(brand_id, gender, product_type))")
      .eq("product_images.products.brand_id", brandId);

    if (clayError) {
      console.error("Failed to fetch clay images:", clayError);
      throw new Error("Failed to fetch clay images");
    }

    let allClayImages = (clayImagesData || []) as ClayImageWithMeta[];
    
    // Filter by gender if specified (applies to all)
    if (gender && gender !== "all") {
      allClayImages = allClayImages.filter(
        (c) => c.product_images.products.gender === gender
      );
    }

    // Build generation tasks
    let tasks: GenerationTask[] = [];

    // Extract lookId from first pairing if available (for job tracking)
    const primaryLookId = bulkMode && pairings?.length > 0 ? pairings[0].lookId : null;

    if (bulkMode && pairings && pairings.length > 0) {
      // Bulk mode: process all pairings with per-pairing product type filtering
      console.log(`Bulk mode: processing ${pairings.length} pairings`);

      for (const pairing of pairings as Pairing[]) {
        // Store brand clay images for this pairing (no product type filter at pairing level)
        let allClayImagesForBrand = [...allClayImages];

        for (const pairingSlot of pairing.slots) {
          // Start with all clay images
          let slotClayImages = [...allClayImagesForBrand];
          
          // Only apply product type filtering for D (Detail) slot
          // A (Full Front), B (Cropped Front), and C (Full Back) use ALL available poses regardless of product type
          const shouldFilterByProductType = (pairingSlot === 'D');
          if (shouldFilterByProductType && pairing.productType) {
            const productTypeFilter = pairing.productType === 'tops' ? 'tops' : 'trousers';
            slotClayImages = slotClayImages.filter(
              (c) => c.product_images.products.product_type === productTypeFilter
            );
            console.log(`[BULK] Slot ${pairingSlot}: After product type filter (${productTypeFilter}): ${slotClayImages.length} clay images`);
          } else {
            console.log(`[BULK] Slot ${pairingSlot}: Using ALL poses (no product type filter for universal slots A/B/C)`);
          }

          // Get clay images for this slot
          const slotPoses = slotClayImages.filter(
            (c) => c.product_images.slot === pairingSlot
          );

          if (slotPoses.length === 0) {
            console.log(`No poses for slot ${pairingSlot}, skipping`);
            continue;
          }

          // Randomly select poses
          const shuffled = [...slotPoses].sort(() => Math.random() - 0.5);
          const selectedPoses = shuffled.slice(0, Math.min(randomCount, slotPoses.length));

          // Create tasks for each pose and attempt
          for (const pose of selectedPoses) {
            for (let attempt = 0; attempt < attemptsPerPose; attempt++) {
              tasks.push({
                talentImageUrl: pairing.talentImageUrl,
                talentImageId: pairing.talentImageId,
                view: pairing.view,
                slot: pairingSlot,
                poseId: pose.id,
                poseUrl: pose.stored_url,
                attempt,
                lookId: pairing.lookId,
              });
            }
          }
        }
      }
    } else {
      // Legacy single mode for backwards compatibility
      if (!talentImageUrl || !view || !slot) {
        return new Response(
          JSON.stringify({ error: "talentImageUrl, view, and slot are required for single mode" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const slotPoses = allClayImages.filter(
        (c) => c.product_images.slot === slot
      );

      if (slotPoses.length === 0) {
        return new Response(
          JSON.stringify({ error: "No clay images found for this selection" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const shuffled = [...slotPoses].sort(() => Math.random() - 0.5);
      const selectedPoses = shuffled.slice(0, Math.min(randomCount, slotPoses.length));

      for (const pose of selectedPoses) {
        for (let attempt = 0; attempt < attemptsPerPose; attempt++) {
          tasks.push({
            talentImageUrl,
            talentImageId: "legacy",
            view,
            slot,
            poseId: pose.id,
            poseUrl: pose.stored_url,
            attempt,
          });
        }
      }
    }

    if (tasks.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid tasks to generate" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Created ${tasks.length} generation tasks`);

    // Create job record - use first task's slot/view for record (bulk jobs span multiple)
    const { data: job, error: jobError } = await supabase
      .from("generation_jobs")
      .insert({
        brand_id: brandId,
        talent_id: talentId,
        look_id: primaryLookId,
        view: bulkMode ? "bulk" : view,
        slot: bulkMode ? "bulk" : slot,
        random_count: randomCount,
        attempts_per_pose: attemptsPerPose,
        status: "running",
        progress: 0,
        total: tasks.length,
        logs: bulkMode ? { pairings: pairings.length, mode: "bulk", model: selectedModel } : null,
      })
      .select()
      .single();

    if (jobError) {
      console.error("Failed to create job:", jobError);
      throw new Error("Failed to create generation job");
    }

    console.log(`Created job ${job.id} with ${tasks.length} total tasks - returning to client for orchestration`);

    // Return tasks to client for client-side orchestration (no background processing)
    return new Response(
      JSON.stringify({ 
        success: true, 
        jobId: job.id,
        taskCount: tasks.length,
        tasks: tasks,
        model: selectedModel,
        message: `Ready to generate ${tasks.length} images` 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Service temporarily unavailable" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
