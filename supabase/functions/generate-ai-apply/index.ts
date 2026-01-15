import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// View-specific pose and framing instructions (from working generate-face-application)
const VIEW_PROMPTS: Record<string, string> = {
  full_front: `Full-length front-facing portrait showing the complete outfit from head to toe. Model standing upright with head held straight and aligned with the torso. Eyes looking directly at the camera with a calm, steady gaze. Brows in a soft, neutral resting position. Mouth closed with an extremely subtle smile.

Keep face and lighting consistent from image 2, make sure to keep freckles intact.`,

  cropped_front: `Close-up front-facing portrait cropped at chest level, focusing on the face and upper body. Head held upright and aligned with the torso, showing no noticeable tilt left or right. Chin is neutral and level. Eyes looking directly at the camera with a calm, steady gaze.

Keep face and lighting consistent from image 2, make sure to keep freckles intact.`,

  front: `Front-facing portrait with full visibility of the face and outfit. Head held upright and aligned with the torso. Eyes looking directly at the camera with a calm, steady gaze.

Keep face and lighting consistent from image 2, make sure to keep freckles intact.`,

  back: `Back-facing pose with shoulders squared to the camera. Head is rotated slightly to her left (camera right), creating a soft partial profile. Chin is neutral and level. The face is visible only in side view, with the cheek, jawline, and nose seen in gentle profile while the eyes are turned away from the camera. Overall posture is upright, calm, and centered.

Keep face and lighting consistent from image 2.`,

  side: `Side profile view with the model's face in clean profile. Head held upright, chin neutral and level. The full outline of the face is visible - forehead, nose, lips, and chin in silhouette against the background.

Keep face and lighting consistent from image 2.`,

  detail: `Close-up detail shot focusing on a specific feature of the outfit (collar, cuff, pocket, or texture). Frame tightly on the detail while keeping the model's face partially visible at the edge of frame for context.

Keep face and lighting consistent from image 2.`,
};

const STUDIO_LIGHTING_PROMPT = `Model photographed in soft, high-key studio lighting against a clean white background with no visible texture. Light is diffused and even, creating minimal shadows. Key light is centred and slightly above eye level, producing gentle falloff on the cheeks and a natural, matte skin appearance. No harsh rim light. Overall look is crisp, neutral, and modern, similar to premium fashion e-commerce photography. Colours are true-to-life with subtle contrast.`;

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
    const viewsToProcess = view ? [view] : ['full_front', 'cropped_front', 'back', 'detail'];

    // Get source images with matched_face_url (from Face Match stage)
    const { data: sourceImages } = await supabase
      .from('look_source_images')
      .select('id, look_id, view, source_url, head_cropped_url, matched_face_url')
      .eq('look_id', lookId);

    console.log(`[AI Apply] Found ${sourceImages?.length || 0} source images for look`);
    
    // Log what we have for debugging
    for (const img of sourceImages || []) {
      console.log(`[AI Apply] Source image ${img.view}: body=${img.source_url ? 'YES' : 'NO'}, matched_face=${img.matched_face_url ? 'YES' : 'NO'}`);
    }

    // View name mapping: generation views -> database views
    const viewAliases: Record<string, string[]> = {
      'full_front': ['full_front', 'front'],
      'cropped_front': ['cropped_front', 'front'],
      'back': ['back'],
      'detail': ['detail', 'side'],
    };

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
        bodyImage = sourceImages?.find(s => ['full_front', 'cropped_front', 'front'].includes(s.view));
      }

      if (!bodyImage) {
        console.log(`[AI Apply] SKIP: No body image found for ${currentView}`);
        continue;
      }

      // CORRECT INPUTS:
      // - bodyImageUrl: Full body outfit from source_url
      // - modelPortraitUrl: Model face from matched_face_url (set in Face Match stage)
      const bodyImageUrl = bodyImage.source_url;
      const modelPortraitUrl = bodyImage.matched_face_url;

      if (!bodyImageUrl) {
        console.log(`[AI Apply] SKIP: No body source_url for ${currentView}`);
        continue;
      }

      if (!modelPortraitUrl) {
        console.log(`[AI Apply] SKIP: No matched_face_url for ${currentView} - Face Match stage not completed`);
        continue;
      }

      console.log(`[AI Apply] Body image (source_url) for ${currentView}: ${bodyImageUrl.substring(0, 80)}...`);
      console.log(`[AI Apply] Model portrait (matched_face_url) for ${currentView}: ${modelPortraitUrl.substring(0, 80)}...`);
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

      // Get current attempt count for this view
      const { data: existingOutputs } = await supabase
        .from('ai_apply_outputs')
        .select('attempt_index')
        .eq('job_id', jobId)
        .eq('view', currentView)
        .order('attempt_index', { ascending: false })
        .limit(1);

      const startIndex = existingOutputs?.[0]?.attempt_index ?? -1;

      // Create output records
      for (let i = 0; i < attemptsToCreate; i++) {
        const attemptIndex = startIndex + 1 + i;
        
        await supabase.from('ai_apply_outputs').insert({
          job_id: jobId,
          look_id: lookId,
          view: currentView,
          attempt_index: attemptIndex,
          head_image_id: null,
          head_image_url: modelPortraitUrl,  // Model portrait from Face Match
          body_image_id: bodyImage.id,
          body_image_url: bodyImageUrl,      // Full body from source_url
          status: 'generating',
          prompt_version: 'v3-matched-face',
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

      // Process each pending output for this view
      const { data: pendingOutputs } = await supabase
        .from('ai_apply_outputs')
        .select('*')
        .eq('job_id', jobId)
        .eq('view', currentView)
        .eq('status', 'generating');

      for (const output of pendingOutputs || []) {
        try {
          // Build the prompt using the CORRECT format from generate-face-application
          const viewPrompt = VIEW_PROMPTS[currentView] || VIEW_PROMPTS.front || '';
          
          let finalPrompt: string;
          if (customPrompt) {
            // Use custom prompt if provided, but still append view-specific instructions
            finalPrompt = `${customPrompt}

${viewPrompt}

${STUDIO_LIGHTING_PROMPT}`;
          } else {
            // Default prompt: explicit face swap instruction
            finalPrompt = `Recreate image 1, keep the crop, pose and clothing exactly the same but put the head of image 2 on it. ${viewPrompt}

${STUDIO_LIGHTING_PROMPT}`;
          }

          console.log(`[AI Apply] Generating output ${output.id} for ${currentView} attempt ${output.attempt_index}`);

          // Call Lovable AI Gateway
          // CRITICAL: Image order matters! Image 1 = body, Image 2 = head
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
                      { type: 'image_url', image_url: { url: output.body_image_url } },  // Image 1 = Body
                      { type: 'image_url', image_url: { url: output.head_image_url } },  // Image 2 = Head
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
