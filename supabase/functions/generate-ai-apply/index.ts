import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// View-specific pose and framing instructions
const VIEW_PROMPTS: Record<string, string> = {
  full_front: `Front-facing portrait with the head held upright and aligned with the torso, showing no noticeable tilt left or right. Chin is neutral and level, giving a centred, composed posture. Eyes looking directly at the camera with a calm, steady gaze. Eyelids moderately open — relaxed and natural, not widened, creating a serene, attentive expression. Brows in a soft, neutral resting position. Mouth closed with an extremely subtle, low-intensity smile: the lips rest naturally with only a faint softening, no upward corner lift.`,

  cropped_front: `Front-facing portrait with the head held upright and aligned with the torso, showing no noticeable tilt left or right. Chin is neutral and level, giving a centred, composed posture. Eyes looking directly at the camera with a calm, steady gaze. Eyelids moderately open — relaxed and natural, not widened, creating a serene, attentive expression. Brows in a soft, neutral resting position. Mouth closed with an extremely subtle, low-intensity smile: the lips rest naturally with only a faint softening, no upward corner lift.`,

  front: `Front-facing portrait with the head held upright and aligned with the torso, showing no noticeable tilt left or right. Chin is neutral and level, giving a centred, composed posture. Eyes looking directly at the camera with a calm, steady gaze. Eyelids moderately open — relaxed and natural, not widened, creating a serene, attentive expression. Brows in a soft, neutral resting position. Mouth closed with an extremely subtle, low-intensity smile: the lips rest naturally with only a faint softening, no upward corner lift.`,

  back: `Back-facing pose with shoulders squared to the camera. Head is rotated slightly to her left (camera right), creating a soft partial profile. Chin is neutral and level. The face is visible only in side view, with the cheek, jawline, and nose seen in gentle profile while the eyes are turned away from the camera. Overall posture is upright, calm, and centered.`,

  side: `Side profile view with the model's face in clean profile. Head held upright, chin neutral and level. The full outline of the face is visible - forehead, nose, lips, and chin in silhouette against the background.`,

  detail: `Close-up detail shot focusing on a specific feature of the outfit (collar, cuff, pocket, or texture). Frame tightly on the detail while keeping the model's face partially visible at the edge of frame for context.`,
};

const STUDIO_LIGHTING_PROMPT = `Model shot in soft, high-key studio lighting. Background is clean white with no visible texture. Light is diffused and even, creating minimal shadows. Key light is centred and slightly above eye level, producing gentle falloff on the cheeks and a natural, matte skin appearance. No harsh rim light. Overall look is crisp, neutral, and modern, similar to premium fashion e-commerce photography. Colours are true-to-life with subtle contrast.`;

interface RequestBody {
  projectId: string;
  lookId: string;
  view?: string; // Single view or undefined for all
  type: 'run' | 'add_more' | 'retry_failed';
  attemptsPerView?: number;
  model?: string;
  strictness?: 'high' | 'medium' | 'low';
  prompt?: string; // Custom prompt override
}

// Helper to upload base64 image to storage
async function uploadToStorage(
  supabase: any,
  base64Data: string,
  jobId: string,
  view: string,
  attemptIndex: number
): Promise<string | null> {
  try {
    // Remove data:image/xxx;base64, prefix if present
    const base64Content = base64Data.includes(',') 
      ? base64Data.split(',')[1] 
      : base64Data;
    
    // Decode base64 to binary
    const binaryString = atob(base64Content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const fileName = `ai-apply/${jobId}/${view}-${attemptIndex}-${Date.now()}.png`;

    const { error: uploadError } = await supabase.storage
      .from("images")
      .upload(fileName, bytes, { 
        contentType: "image/png", 
        upsert: true 
      });

    if (uploadError) {
      console.error("[AI Apply] Upload error:", uploadError);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from("images")
      .getPublicUrl(fileName);

    return publicUrl;
  } catch (err) {
    console.error("[AI Apply] Upload exception:", err);
    return null;
  }
}

// Helper to generate outfit description from an image
async function generateOutfitDescription(
  imageUrl: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<string> {
  try {
    console.log(`[AI Apply] Generating outfit description for image...`);
    
    const descResponse = await fetch(
      `${supabaseUrl}/functions/v1/generate-outfit-description`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ imageUrl }),
      }
    );
    
    if (descResponse.ok) {
      const descResult = await descResponse.json();
      const description = descResult.description || "the outfit shown";
      console.log(`[AI Apply] Outfit description: "${description}"`);
      return description;
    } else {
      console.error(`[AI Apply] Outfit description API error: ${descResponse.status}`);
      return "the outfit shown";
    }
  } catch (err) {
    console.error(`[AI Apply] Failed to generate outfit description:`, err);
    return "the outfit shown";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const body: RequestBody = await req.json();
    const { 
      projectId, 
      lookId, 
      view, 
      type, 
      attemptsPerView = 4,
      model = 'google/gemini-2.5-flash-image-preview',
      strictness = 'high',
      prompt: customPrompt
    } = body;

    console.log(`[AI Apply] Starting ${type} for look ${lookId}, view: ${view || 'all'}, model: ${model}`);

    // Get or create AI Apply job for this look
    let { data: existingJob } = await supabase
      .from('ai_apply_jobs')
      .select('*')
      .eq('project_id', projectId)
      .eq('look_id', lookId)
      .single();

    let jobId: string;
    let digitalTalentId: string | null = null;

    if (!existingJob) {
      // Get digital talent ID from face_application_jobs
      const { data: faceAppJob } = await supabase
        .from('face_application_jobs')
        .select('digital_talent_id')
        .eq('project_id', projectId)
        .eq('look_id', lookId)
        .single();

      digitalTalentId = faceAppJob?.digital_talent_id;

      const { data: newJob, error: jobError } = await supabase
        .from('ai_apply_jobs')
        .insert({
          project_id: projectId,
          look_id: lookId,
          digital_talent_id: digitalTalentId,
          status: 'running',
          model,
          attempts_per_view: attemptsPerView,
          strictness,
        })
        .select()
        .single();

      if (jobError) throw jobError;
      jobId = newJob.id;
    } else {
      jobId = existingJob.id;
      digitalTalentId = existingJob.digital_talent_id;
      // Update job status
      await supabase
        .from('ai_apply_jobs')
        .update({ status: 'running', model, strictness })
        .eq('id', jobId);
    }

    // Determine which views to process
    const viewsToProcess = view ? [view] : ['front', 'back', 'detail'];

    // Get source images (simplified query - no FK join needed)
    const { data: sourceImages } = await supabase
      .from('look_source_images')
      .select('id, look_id, view, source_url, head_cropped_url, matched_face_url')
      .eq('look_id', lookId);

    console.log(`[AI Apply] Found ${sourceImages?.length || 0} source images for look`);

    // Get the Digital Talent's portrait via talent_looks (separate query)
    const { data: talentLook } = await supabase
      .from('talent_looks')
      .select(`
        digital_talent_id,
        digital_talent:digital_talents!digital_talent_id (
          id, name, front_face_url
        )
      `)
      .eq('id', lookId)
      .single();

    const talentPortraitUrl = (talentLook?.digital_talent as any)?.front_face_url;
    console.log(`[AI Apply] Talent portrait: ${talentPortraitUrl ? 'YES (' + talentPortraitUrl.substring(0, 50) + '...)' : 'NO'}`);

    // Log what we have for debugging
    for (const img of sourceImages || []) {
      console.log(`[AI Apply] Source image ${img.view}: crop=${img.head_cropped_url ? 'YES' : 'NO'}, paired_face=${img.matched_face_url ? 'YES' : 'NO'}`);
    }

    // View name mapping: generation views -> database views
    const viewAliases: Record<string, string[]> = {
      'front': ['front', 'full_front', 'cropped_front'],
      'back': ['back'],
      'detail': ['detail', 'side'],
    };

    // Check if we have talent portrait before processing any views
    if (!talentPortraitUrl) {
      console.log(`[AI Apply] SKIP ALL: No digital talent portrait - Digital Talent not linked to this look`);
      await supabase
        .from('ai_apply_jobs')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', jobId);
      
      return new Response(
        JSON.stringify({ success: false, error: 'No digital talent portrait linked to this look' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // RESUME LOGIC: Reset any outputs stuck in 'generating' for over 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: stalledOutputs } = await supabase
      .from('ai_apply_outputs')
      .update({ status: 'pending' })
      .eq('status', 'generating')
      .lt('created_at', fiveMinutesAgo)
      .select('id');
    
    if (stalledOutputs && stalledOutputs.length > 0) {
      console.log(`[AI Apply] Reset ${stalledOutputs.length} stalled outputs to 'pending'`);
    }

    // Process each view
    for (const currentView of viewsToProcess) {
      console.log(`[AI Apply] Processing view: ${currentView}`);

      // Get body image for this view - check all aliases
      const aliases = viewAliases[currentView] || [currentView];
      let bodyImage = sourceImages?.find(s => aliases.includes(s.view));
      
      if (!bodyImage) {
        // Fallback logic for front views
        if (currentView === 'back') {
          console.log(`[AI Apply] SKIP: No back body image for back view`);
          continue;
        }
        bodyImage = sourceImages?.find(s => ['front', 'full_front'].includes(s.view));
      }

      if (!bodyImage) {
        console.log(`[AI Apply] SKIP: No body image found for ${currentView}`);
        continue;
      }

      // CORRECT 3 INPUTS:
      // - Image 1: head_cropped_url (the crop we describe in the prompt)
      // - Image 2: matched_face_url (paired face from Face Match stage)
      // - Image 3: digital_talents.front_face_url (talent's primary portrait - fetched above)
      const cropImageUrl = bodyImage.head_cropped_url;                              // Image 1
      const pairedFaceUrl = bodyImage.matched_face_url;                             // Image 2

      if (!cropImageUrl) {
        console.log(`[AI Apply] SKIP: No head_cropped_url for ${currentView} - Head Crop stage not completed`);
        continue;
      }

      if (!pairedFaceUrl) {
        console.log(`[AI Apply] SKIP: No matched_face_url for ${currentView} - Face Match stage not completed`);
        continue;
      }

      console.log(`[AI Apply] Image 1 (crop): ${cropImageUrl.substring(0, 60)}...`);
      console.log(`[AI Apply] Image 2 (paired face): ${pairedFaceUrl.substring(0, 60)}...`);
      console.log(`[AI Apply] Image 3 (talent portrait): ${talentPortraitUrl.substring(0, 60)}...`);

      // Determine how many attempts to create
      let attemptsToCreate = attemptsPerView;

      if (type === 'add_more') {
        attemptsToCreate = 2;
      } else if (type === 'retry_failed') {
        const { data: failedOutputs } = await supabase
          .from('ai_apply_outputs')
          .select('id')
          .eq('job_id', jobId)
          .eq('view', currentView)
          .eq('status', 'failed');
        
        if (failedOutputs) {
          for (const failed of failedOutputs) {
            await supabase.from('ai_apply_outputs').delete().eq('id', failed.id);
          }
          attemptsToCreate = failedOutputs.length;
        }
      }

      // Check for existing pending outputs that can be resumed
      const { data: pendingToResume } = await supabase
        .from('ai_apply_outputs')
        .select('id')
        .eq('job_id', jobId)
        .eq('view', currentView)
        .eq('status', 'pending');
      
      const pendingCount = pendingToResume?.length || 0;
      if (pendingCount > 0) {
        console.log(`[AI Apply] Found ${pendingCount} pending outputs to resume for ${currentView}`);
      }

      // Get current attempt count for this view
      const { data: existingOutputs } = await supabase
        .from('ai_apply_outputs')
        .select('attempt_index')
        .eq('job_id', jobId)
        .eq('view', currentView)
        .order('attempt_index', { ascending: false })
        .limit(1);

      const startIndex = existingOutputs?.[0]?.attempt_index ?? -1;

      // Only create NEW outputs if we need more than what's already pending
      const newOutputsNeeded = Math.max(0, attemptsToCreate - pendingCount);
      
      // Create output records with 'pending' status (not 'generating')
      for (let i = 0; i < newOutputsNeeded; i++) {
        const attemptIndex = startIndex + 1 + i;
        
        await supabase.from('ai_apply_outputs').insert({
          job_id: jobId,
          look_id: lookId,
          view: currentView,
          attempt_index: attemptIndex,
          head_image_id: null,
          head_image_url: talentPortraitUrl,  // Store talent portrait as reference
          body_image_id: bodyImage.id,
          body_image_url: cropImageUrl,        // Store the crop as the body reference
          status: 'pending',  // Start as pending, mark generating only when actively processing
          prompt_version: 'v4-3-image-dynamic',
        });
      }

      // Update job progress
      const { data: allOutputs } = await supabase
        .from('ai_apply_outputs')
        .select('id')
        .eq('job_id', jobId);

      await supabase
        .from('ai_apply_jobs')
        .update({ 
          total: allOutputs?.length || 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);

      // Generate outfit description from Image 1 (the crop)
      // This only needs to be done once per view, not per attempt
      const outfitDescription = await generateOutfitDescription(cropImageUrl, supabaseUrl, supabaseKey);

      // Process pending outputs for this view (including newly reset ones)
      const { data: outputsToProcess } = await supabase
        .from('ai_apply_outputs')
        .select('*')
        .eq('job_id', jobId)
        .eq('view', currentView)
        .in('status', ['pending', 'generating'])  // Process both pending and generating (for resume)
        .order('attempt_index', { ascending: true });

      for (const output of outputsToProcess || []) {
        // Mark as 'generating' right before we start processing
        await supabase
          .from('ai_apply_outputs')
          .update({ status: 'generating' })
          .eq('id', output.id);
        try {
          // Build the prompt with dynamic outfit description
          const viewPrompt = VIEW_PROMPTS[currentView] || VIEW_PROMPTS.front || '';
          
          let finalPrompt: string;
          if (customPrompt) {
            // Use custom prompt if provided, but still append view-specific instructions
            finalPrompt = `${customPrompt}

${viewPrompt}

Keep face and lighting consistent from image 3.

${STUDIO_LIGHTING_PROMPT}`;
          } else {
            // Default prompt with dynamic outfit description
            finalPrompt = `Recreate image 1 with "${outfitDescription}", keep the crop, pose and clothing exactly the same but put the head of image 2 on it.

${viewPrompt}

Keep face and lighting consistent from image 3.

${STUDIO_LIGHTING_PROMPT}`;
          }

          console.log(`[AI Apply] Generating output ${output.id} for ${currentView} attempt ${output.attempt_index}`);

          // Call Lovable AI Gateway with 3 images
          // CRITICAL: Image order matters!
          // Image 1 = crop (outfit/pose)
          // Image 2 = paired face (from Face Match)
          // Image 3 = talent portrait (identity reference)
          const aiResponse = await fetch(
            "https://ai.gateway.lovable.dev/v1/chat/completions",
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${lovableApiKey}`,
              },
              body: JSON.stringify({
                model: model,
                messages: [
                  {
                    role: 'user',
                    content: [
                      { type: 'text', text: finalPrompt },
                      { type: 'image_url', image_url: { url: cropImageUrl } },         // Image 1 = Crop (outfit)
                      { type: 'image_url', image_url: { url: pairedFaceUrl } },        // Image 2 = Paired face
                      { type: 'image_url', image_url: { url: talentPortraitUrl } },    // Image 3 = Talent portrait
                    ],
                  },
                ],
                modalities: ['image', 'text'],
              }),
            }
          );

          if (!aiResponse.ok) {
            const errorText = await aiResponse.text();
            console.error(`[AI Apply] AI API error: ${aiResponse.status}`, errorText);
            throw new Error(`AI generation failed: ${aiResponse.status} - ${errorText}`);
          }

          const aiResult = await aiResponse.json();
          console.log(`[AI Apply] AI response received for ${output.id}`);

          // Extract the image from the response
          const imageData = aiResult.choices?.[0]?.message?.images?.[0]?.image_url?.url;

          if (imageData) {
            // Upload to Supabase Storage
            const storedUrl = await uploadToStorage(
              supabase,
              imageData,
              jobId,
              currentView,
              output.attempt_index
            );

            if (storedUrl) {
              // Update output with result
              await supabase
                .from('ai_apply_outputs')
                .update({
                  stored_url: storedUrl,
                  status: 'completed',
                  final_prompt: finalPrompt,
                })
                .eq('id', output.id);

              console.log(`[AI Apply] SUCCESS: Output ${output.id} saved to ${storedUrl.substring(0, 60)}...`);
            } else {
              throw new Error('Failed to upload image to storage');
            }
          } else {
            console.error(`[AI Apply] No image in response:`, JSON.stringify(aiResult).slice(0, 500));
            throw new Error('No image in AI response');
          }

          // Update job progress
          const { data: completedOutputs } = await supabase
            .from('ai_apply_outputs')
            .select('id')
            .eq('job_id', jobId)
            .eq('status', 'completed');

          await supabase
            .from('ai_apply_jobs')
            .update({ 
              progress: completedOutputs?.length || 0,
              updated_at: new Date().toISOString()
            })
            .eq('id', jobId);

        } catch (error: any) {
          console.error(`[AI Apply] Error generating output ${output.id}:`, error);
          
          await supabase
            .from('ai_apply_outputs')
            .update({
              status: 'failed',
              error_message: error.message,
            })
            .eq('id', output.id);
        }
      }
    }

    // Check if all outputs are done
    const { data: finalOutputs } = await supabase
      .from('ai_apply_outputs')
      .select('status')
      .eq('job_id', jobId);

    const allDone = finalOutputs?.every(o => o.status === 'completed' || o.status === 'failed');
    const anyFailed = finalOutputs?.some(o => o.status === 'failed');

    await supabase
      .from('ai_apply_jobs')
      .update({ 
        status: allDone ? (anyFailed ? 'failed' : 'completed') : 'running',
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);

    console.log(`[AI Apply] Job ${jobId} completed for look ${lookId}`);

    return new Response(
      JSON.stringify({ success: true, jobId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[AI Apply] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
