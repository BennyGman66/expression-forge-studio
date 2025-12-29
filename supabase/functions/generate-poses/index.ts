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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      brandId,
      talentId,
      pairings,
      gender,
      randomCount,
      attemptsPerPose,
      bulkMode,
      // Legacy single-mode params
      talentImageUrl,
      view,
      slot,
    } = body;

    if (!brandId || !talentId) {
      return new Response(
        JSON.stringify({ error: "brandId and talentId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

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
    let tasks: {
      talentImageUrl: string;
      talentImageId: string;
      view: string;
      slot: string;
      poseId: string;
      poseUrl: string;
      attempt: number;
    }[] = [];

    if (bulkMode && pairings && pairings.length > 0) {
      // Bulk mode: process all pairings with per-pairing product type filtering
      console.log(`Bulk mode: processing ${pairings.length} pairings`);

      for (const pairing of pairings as Pairing[]) {
        // Filter clay images for this pairing based on product type
        let pairingClayImages = [...allClayImages];
        
        if (pairing.productType) {
          const productTypeFilter = pairing.productType === 'tops' ? 'tops' : 'trousers';
          pairingClayImages = pairingClayImages.filter(
            (c) => c.product_images.products.product_type === productTypeFilter
          );
          console.log(`Pairing has productType=${pairing.productType}, filtered to ${pairingClayImages.length} clay images`);
        }

        for (const pairingSlot of pairing.slots) {
          // Get clay images for this slot
          const slotPoses = pairingClayImages.filter(
            (c) => c.product_images.slot === pairingSlot
          );

          if (slotPoses.length === 0) {
            console.log(`No poses for slot ${pairingSlot} with productType=${pairing.productType}, skipping`);
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
        view: bulkMode ? "bulk" : view,
        slot: bulkMode ? "bulk" : slot,
        random_count: randomCount,
        attempts_per_pose: attemptsPerPose,
        status: "running",
        progress: 0,
        total: tasks.length,
        logs: bulkMode ? { pairings: pairings.length, mode: "bulk" } : null,
      })
      .select()
      .single();

    if (jobError) {
      console.error("Failed to create job:", jobError);
      throw new Error("Failed to create generation job");
    }

    console.log(`Created job ${job.id} with ${tasks.length} total generations`);

    // Process in background
    (globalThis as any).EdgeRuntime?.waitUntil?.(
      processGenerations(supabase, job.id, tasks, lovableApiKey)
    ) ?? processGenerations(supabase, job.id, tasks, lovableApiKey);

    return new Response(
      JSON.stringify({ 
        success: true, 
        jobId: job.id,
        taskCount: tasks.length,
        message: `Started generating ${tasks.length} images` 
      }),
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

interface GenerationTask {
  talentImageUrl: string;
  talentImageId: string;
  view: string;
  slot: string;
  poseId: string;
  poseUrl: string;
  attempt: number;
}

async function processGenerations(
  supabase: any,
  jobId: string,
  tasks: GenerationTask[],
  lovableApiKey: string
) {
  console.log(`Processing ${tasks.length} generation tasks`);

  let progress = 0;
  const total = tasks.length;
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 10;

  for (const task of tasks) {
    progress++;
    console.log(`[${progress}/${total}] View: ${task.view}, Slot: ${task.slot}, Pose: ${task.poseId}, Attempt: ${task.attempt + 1}`);

    try {
      // Update job progress
      await supabase
        .from("generation_jobs")
        .update({ progress, updated_at: new Date().toISOString() })
        .eq("id", jobId);

      // Generate image using Lovable AI
      const prompt = `You are a professional fashion photography AI. Your task is to transfer the exact pose and body position from the clay model reference onto the digital talent.

CRITICAL REQUIREMENTS:
1. The output person MUST match the talent reference image exactly - same face, skin tone, hair, and physical features
2. The body pose MUST match the clay model reference exactly - same stance, arm positions, leg positions, and body angle
3. Create a clean, professional fashion photography look with neutral studio lighting
4. The background should be clean white or light grey studio backdrop
5. Maintain photorealistic quality suitable for e-commerce
6. Do not add any clothing - the model should appear as in the talent reference
7. Match the camera angle and framing of the clay model

Generate a high-quality fashion photograph combining the talent's appearance with the clay model's pose.`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image-preview",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "text", text: "TALENT REFERENCE (copy this person's appearance):" },
                { type: "image_url", image_url: { url: task.talentImageUrl } },
                { type: "text", text: "POSE REFERENCE (copy this exact pose):" },
                { type: "image_url", image_url: { url: task.poseUrl } },
              ],
            },
          ],
          modalities: ["image", "text"],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`AI API error:`, response.status, errorText);
        
        if (response.status === 429) {
          console.log("Rate limited, waiting 30 seconds...");
          await new Promise((r) => setTimeout(r, 30000));
          // Don't increment progress, will retry on next iteration concept
          consecutiveErrors++;
        } else {
          consecutiveErrors++;
        }

        if (consecutiveErrors >= maxConsecutiveErrors) {
          console.error(`Too many consecutive errors (${consecutiveErrors}), aborting job`);
          await supabase
            .from("generation_jobs")
            .update({ 
              status: "failed", 
              updated_at: new Date().toISOString(),
              logs: { error: "Too many consecutive errors" }
            })
            .eq("id", jobId);
          return;
        }
        continue;
      }

      // Reset error counter on success
      consecutiveErrors = 0;

      const data = await response.json();
      const generatedImageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

      if (!generatedImageUrl) {
        console.error("No image returned from AI");
        continue;
      }

      // Upload to storage
      const base64Data = generatedImageUrl.replace(/^data:image\/\w+;base64,/, "");
      const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
      
      const fileName = `generations/${jobId}/${task.view}_${task.slot}_${task.poseId}_${task.attempt}_${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage
        .from("images")
        .upload(fileName, binaryData, {
          contentType: "image/png",
          upsert: true,
        });

      if (uploadError) {
        console.error(`Upload error:`, uploadError);
        continue;
      }

      const { data: { publicUrl } } = supabase.storage
        .from("images")
        .getPublicUrl(fileName);

      // Save to generations table
      const { error: insertError } = await supabase
        .from("generations")
        .insert({
          generation_job_id: jobId,
          pose_clay_image_id: task.poseId,
          attempt_index: task.attempt,
          stored_url: publicUrl,
        });

      if (insertError) {
        console.error(`Insert error:`, insertError);
        continue;
      }

      console.log(`Successfully generated ${fileName}`);

      // Small delay between requests to avoid rate limiting
      await new Promise((r) => setTimeout(r, 2000));
    } catch (error) {
      console.error(`Error processing task:`, error);
      consecutiveErrors++;
      
      if (consecutiveErrors >= maxConsecutiveErrors) {
        console.error(`Too many consecutive errors, aborting job`);
        await supabase
          .from("generation_jobs")
          .update({ 
            status: "failed", 
            updated_at: new Date().toISOString() 
          })
          .eq("id", jobId);
        return;
      }
    }
  }

  // Mark job as completed
  await supabase
    .from("generation_jobs")
    .update({ 
      status: "completed", 
      progress: total,
      updated_at: new Date().toISOString() 
    })
    .eq("id", jobId);

  console.log(`Job ${jobId} completed`);
}
