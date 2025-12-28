import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      brandId,
      talentId,
      talentImageUrl,
      view,
      slot,
      gender,
      randomCount,
      attemptsPerPose,
    } = await req.json();

    if (!brandId || !talentId || !talentImageUrl) {
      return new Response(
        JSON.stringify({ error: "brandId, talentId, and talentImageUrl are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch clay images for this brand/slot/gender
    let query = supabase
      .from("clay_images")
      .select("*, product_images!inner(slot, products!inner(brand_id, gender))")
      .eq("product_images.products.brand_id", brandId)
      .eq("product_images.slot", slot);

    const { data: clayImagesData, error: clayError } = await query;

    if (clayError) {
      console.error("Failed to fetch clay images:", clayError);
      throw new Error("Failed to fetch clay images");
    }

    let clayImages = clayImagesData || [];
    
    // Filter by gender if specified
    if (gender && gender !== "all") {
      clayImages = clayImages.filter(
        (c: any) => c.product_images.products.gender === gender
      );
    }

    if (clayImages.length === 0) {
      return new Response(
        JSON.stringify({ error: "No clay images found for this selection" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Randomly select poses
    const shuffled = [...clayImages].sort(() => Math.random() - 0.5);
    const selectedPoses = shuffled.slice(0, Math.min(randomCount, clayImages.length));
    const totalGenerations = selectedPoses.length * attemptsPerPose;

    // Create job record
    const { data: job, error: jobError } = await supabase
      .from("generation_jobs")
      .insert({
        brand_id: brandId,
        talent_id: talentId,
        view,
        slot,
        random_count: randomCount,
        attempts_per_pose: attemptsPerPose,
        status: "running",
        progress: 0,
        total: totalGenerations,
      })
      .select()
      .single();

    if (jobError) {
      console.error("Failed to create job:", jobError);
      throw new Error("Failed to create generation job");
    }

    console.log(`Created job ${job.id} with ${totalGenerations} total generations`);

    // Process in background
    (globalThis as any).EdgeRuntime?.waitUntil?.(
      processGenerations(supabase, job.id, selectedPoses, talentImageUrl, attemptsPerPose, lovableApiKey)
    ) ?? processGenerations(supabase, job.id, selectedPoses, talentImageUrl, attemptsPerPose, lovableApiKey);

    return new Response(
      JSON.stringify({ 
        success: true, 
        jobId: job.id,
        message: `Started generating ${totalGenerations} images` 
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

async function processGenerations(
  supabase: any,
  jobId: string,
  poses: any[],
  talentImageUrl: string,
  attemptsPerPose: number,
  lovableApiKey: string
) {
  console.log(`Processing ${poses.length} poses with ${attemptsPerPose} attempts each`);

  let progress = 0;
  const total = poses.length * attemptsPerPose;

  for (const pose of poses) {
    for (let attempt = 0; attempt < attemptsPerPose; attempt++) {
      progress++;
      console.log(`[${progress}/${total}] Generating pose ${pose.id}, attempt ${attempt + 1}`);

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
                  { type: "image_url", image_url: { url: talentImageUrl } },
                  { type: "text", text: "POSE REFERENCE (copy this exact pose):" },
                  { type: "image_url", image_url: { url: pose.stored_url } },
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
            attempt--; // Retry this attempt
            progress--;
            continue;
          }
          continue;
        }

        const data = await response.json();
        const generatedImageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

        if (!generatedImageUrl) {
          console.error("No image returned");
          continue;
        }

        // Upload to storage
        const base64Data = generatedImageUrl.replace(/^data:image\/\w+;base64,/, "");
        const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
        
        const fileName = `generations/${jobId}/${pose.id}_${attempt}_${Date.now()}.png`;
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
            pose_clay_image_id: pose.id,
            attempt_index: attempt,
            stored_url: publicUrl,
          });

        if (insertError) {
          console.error(`Insert error:`, insertError);
          continue;
        }

        console.log(`Successfully generated ${fileName}`);

        // Small delay between requests
        await new Promise((r) => setTimeout(r, 2000));
      } catch (error) {
        console.error(`Error processing pose ${pose.id}, attempt ${attempt}:`, error);
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
