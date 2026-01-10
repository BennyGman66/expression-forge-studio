import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Identity lock prompt template
const IDENTITY_LOCK_PROMPT = `Using the provided head image as the sole identity authority; preserve exact facial identity with zero deviation (structure, tone, texture, freckles). No beautify/smooth.

Using the provided body image as full-body authority; preserve pose, proportions, clothing, crop, and silhouette exactly; no redesign.

Replace head naturally; match perspective and angle to the body so the subject appears coherent.

Preserve studio lighting and background from body image.`;

const VIEW_INSTRUCTIONS: Record<string, string> = {
  full_front: 'The subject is facing forward in a full-body shot.',
  cropped_front: 'The subject is facing forward in a cropped/close-up shot.',
  back: 'The subject is facing away from the camera. Ensure head placement appears natural from behind.',
  detail: 'This is a detail/side angle shot focusing on product features.',
};

interface RequestBody {
  projectId: string;
  lookId: string;
  view?: string; // Single view or undefined for all
  type: 'run' | 'add_more' | 'retry_failed';
  attemptsPerView?: number;
  model?: string;
  strictness?: 'high' | 'medium' | 'low';
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
      strictness = 'high'
    } = body;

    console.log(`[AI Apply] Starting ${type} for look ${lookId}, view: ${view || 'all'}`);

    // Get or create AI Apply job for this look
    let { data: existingJob } = await supabase
      .from('ai_apply_jobs')
      .select('*')
      .eq('project_id', projectId)
      .eq('look_id', lookId)
      .single();

    let jobId: string;

    if (!existingJob) {
      // Get digital talent ID from face_application_jobs
      const { data: faceAppJob } = await supabase
        .from('face_application_jobs')
        .select('digital_talent_id')
        .eq('project_id', projectId)
        .eq('look_id', lookId)
        .single();

      const { data: newJob, error: jobError } = await supabase
        .from('ai_apply_jobs')
        .insert({
          project_id: projectId,
          look_id: lookId,
          digital_talent_id: faceAppJob?.digital_talent_id,
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
      // Update job status
      await supabase
        .from('ai_apply_jobs')
        .update({ status: 'running', model, strictness })
        .eq('id', jobId);
    }

    // Determine which views to process
    const viewsToProcess = view ? [view] : ['full_front', 'cropped_front', 'back', 'detail'];

    // Get source images for pairing
    const { data: sourceImages } = await supabase
      .from('look_source_images')
      .select('id, look_id, view, source_url, head_cropped_url')
      .eq('look_id', lookId);

    // Get selected head renders from face_application_outputs
    const { data: faceAppJobs } = await supabase
      .from('face_application_jobs')
      .select('id')
      .eq('project_id', projectId)
      .eq('look_id', lookId);

    const faceAppJobIds = faceAppJobs?.map(j => j.id) || [];
    
    const { data: headRenders } = await supabase
      .from('face_application_outputs')
      .select('id, job_id, view, stored_url')
      .in('job_id', faceAppJobIds)
      .eq('is_selected', true);

    // Process each view
    for (const currentView of viewsToProcess) {
      console.log(`[AI Apply] Processing view: ${currentView}`);

      // Get body image for this view
      let bodyImage = sourceImages?.find(s => s.view === currentView);
      let bodySource: 'exact' | 'fallback' = 'exact';
      
      if (!bodyImage) {
        // Fallback logic
        if (currentView === 'back') {
          console.log(`[AI Apply] ERROR: No back body image for back view`);
          continue; // Skip - back requires back body
        }
        // Try full_front or front as fallback
        bodyImage = sourceImages?.find(s => s.view === 'full_front') || 
                   sourceImages?.find(s => s.view === 'front');
        bodySource = 'fallback';
      }

      if (!bodyImage) {
        console.log(`[AI Apply] ERROR: No body image found for ${currentView}`);
        continue;
      }

      // Get head render for this view
      const frontViews = ['full_front', 'front', 'cropped_front', 'detail'];
      let headRender = headRenders?.find(h => h.view === currentView);
      let angleMatch: 'exact' | 'reused' | 'risk' = 'exact';

      if (!headRender) {
        if (frontViews.includes(currentView)) {
          headRender = headRenders?.find(h => frontViews.includes(h.view));
          angleMatch = 'reused';
        } else if (currentView === 'back') {
          headRender = headRenders?.find(h => h.view === 'back' || h.view === 'side');
          if (!headRender) {
            headRender = headRenders?.find(h => frontViews.includes(h.view));
            angleMatch = 'risk';
          }
        }
      }

      if (!headRender?.stored_url) {
        console.log(`[AI Apply] ERROR: No head render found for ${currentView}`);
        continue;
      }

      // Determine how many attempts to create
      let attemptsToCreate = attemptsPerView;

      if (type === 'add_more') {
        attemptsToCreate = 2;
      } else if (type === 'retry_failed') {
        // Delete failed outputs and count them
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
          head_image_id: headRender.id,
          head_image_url: headRender.stored_url,
          body_image_id: bodyImage.id,
          body_image_url: bodyImage.source_url,
          status: 'generating',
          prompt_version: 'v1',
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
          // Build the prompt
          const viewInstruction = VIEW_INSTRUCTIONS[currentView] || '';
          const finalPrompt = `${IDENTITY_LOCK_PROMPT}\n\n${viewInstruction}`;

          console.log(`[AI Apply] Generating output ${output.id} for ${currentView}`);

          // Call Lovable AI Gateway directly
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
                      { type: 'image_url', image_url: { url: output.head_image_url } },
                      { type: 'image_url', image_url: { url: output.body_image_url } },
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

              console.log(`[AI Apply] Successfully saved output ${output.id}`);
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

    console.log(`[AI Apply] Completed for look ${lookId}`);

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
