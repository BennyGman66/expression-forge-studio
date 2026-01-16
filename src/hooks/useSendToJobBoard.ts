import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { LookHandoffStatus, REQUIRED_VIEWS } from '@/types/job-handoff';
import { useToast } from '@/hooks/use-toast';

interface SendToJobBoardParams {
  projectId: string;
  jobGroupName: string;
  brief: string;
  looks: LookHandoffStatus[];
}

interface SendResult {
  success: boolean;
  jobGroupId?: string;
  jobIds?: string[];
  error?: string;
}

// Normalize view names from source data to standard views
const normalizeViewForArtifact = (view: string): string => {
  const normalized = view.toLowerCase().replace(/[^a-z_]/g, '');
  if (normalized === 'front' || normalized === 'full_front') return 'full_front';
  if (normalized === 'cropped_front') return 'cropped_front';
  if (normalized === 'back') return 'back';
  if (normalized === 'side' || normalized === 'detail') return 'detail';
  return normalized;
};

// Map normalized view to artifact type
const getSourceArtifactType = (normalizedView: string): string => {
  switch (normalizedView) {
    case 'full_front':
    case 'cropped_front':
      return 'LOOK_ORIGINAL_FRONT';
    case 'back':
      return 'LOOK_ORIGINAL_BACK';
    case 'detail':
      return 'LOOK_ORIGINAL_SIDE';
    default:
      return 'LOOK_ORIGINAL';
  }
};

const getHeadRenderType = (normalizedView: string): string => {
  switch (normalizedView) {
    case 'full_front':
    case 'cropped_front':
      return 'HEAD_RENDER_FRONT';
    case 'back':
      return 'HEAD_RENDER_BACK';
    case 'detail':
      return 'HEAD_RENDER_SIDE';
    default:
      return 'HEAD_RENDER_FRONT';
  }
};

export function useSendToJobBoard() {
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();

  const sendToJobBoard = async ({
    projectId,
    jobGroupName,
    brief,
    looks,
  }: SendToJobBoardParams): Promise<SendResult> => {
    const readyLooks = looks.filter(l => l.isIncluded && l.status === 'ready');
    
    if (readyLooks.length === 0) {
      return { success: false, error: 'No looks selected for sending' };
    }

    if (!brief.trim()) {
      return { success: false, error: 'Production brief is required' };
    }

    setIsSending(true);

    try {
      // 1. Create job group
      const { data: jobGroup, error: groupError } = await supabase
        .from('job_groups')
        .insert({
          project_id: projectId,
          name: jobGroupName,
          brief: brief.trim(),
          total_looks: readyLooks.length,
        })
        .select()
        .single();

      if (groupError) throw groupError;

      const jobIds: string[] = [];

      // 2. Create jobs for each look
      for (const look of readyLooks) {
        // Create the unified job
        const { data: job, error: jobError } = await supabase
          .from('unified_jobs')
          .insert({
            project_id: projectId,
            look_id: look.id,
            type: 'FOUNDATION_FACE_REPLACE',
            status: 'OPEN',
            title: `${look.name} - Face Replace`,
            brief_snapshot: brief.trim(),
            job_group_id: jobGroup.id,
            locked_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (jobError) throw jobError;
        jobIds.push(job.id);

        // 3. Query source images directly from the database to ensure we get them all
        const { data: sourceImages, error: sourceError } = await supabase
          .from('look_source_images')
          .select('id, view, source_url, original_source_url')
          .eq('look_id', look.id);

        if (sourceError) {
          console.error('Error fetching source images:', sourceError);
        }

        // 4. Attach source images (ALWAYS attach front and back if they exist)
        if (sourceImages) {
          for (const sourceImage of sourceImages) {
            const normalizedView = normalizeViewForArtifact(sourceImage.view);
            
            // Only attach front and back source images (as per spec)
            if (normalizedView !== 'full_front' && normalizedView !== 'back') {
              continue;
            }

            const sourceType = getSourceArtifactType(normalizedView);
            
            // Prefer original high-res URL if available
            const fileUrl = sourceImage.original_source_url || sourceImage.source_url;
            
            const { data: sourceArtifact, error: sourceArtifactError } = await supabase
              .from('unified_artifacts')
              .insert({
                project_id: projectId,
                look_id: look.id,
                type: sourceType as any,
                file_url: fileUrl,
                metadata: { view: normalizedView, source_image_id: sourceImage.id },
              })
              .select()
              .single();

            if (sourceArtifactError) {
              console.error('Error creating source artifact:', sourceArtifactError);
            } else {
              const viewLabel = normalizedView === 'full_front' ? 'Full front' : 'Full back';
              await supabase
                .from('job_inputs')
                .insert({
                  job_id: job.id,
                  artifact_id: sourceArtifact.id,
                  label: `Original ${viewLabel}`,
                });
            }
          }
        }

        // 5. Attach head renders from selected outputs
        for (const viewKey of REQUIRED_VIEWS) {
          const viewData = look.views[viewKey];
          
          // Skip if no head render selected for this view
          if (!viewData.selectedUrl) continue;

          const renderType = getHeadRenderType(viewKey);

          const { data: renderArtifact, error: renderArtifactError } = await supabase
            .from('unified_artifacts')
            .insert({
              project_id: projectId,
              look_id: look.id,
              type: renderType as any,
              file_url: viewData.selectedUrl,
              source_table: 'ai_apply_outputs',
              source_id: viewData.outputId,
              metadata: { view: viewKey },
            })
            .select()
            .single();

          if (renderArtifactError) {
            console.error('Error creating render artifact:', renderArtifactError);
          } else {
            const viewLabel = viewKey.replace('_', ' ');
            await supabase
              .from('job_inputs')
              .insert({
                job_id: job.id,
                artifact_id: renderArtifact.id,
                label: `Head render ${viewLabel}`,
              });
          }
        }
      }

      // 6. Create audit event
      await supabase
        .from('audit_events')
        .insert({
          project_id: projectId,
          action: 'JOB_BATCH_CREATED',
          metadata: {
            job_group_id: jobGroup.id,
            job_count: jobIds.length,
            look_names: readyLooks.map(l => l.name),
          },
        });

      toast({
        title: 'Jobs Created Successfully',
        description: `${jobIds.length} jobs sent to the Job Board`,
      });

      return {
        success: true,
        jobGroupId: jobGroup.id,
        jobIds,
      };
    } catch (err) {
      console.error('Error sending to job board:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to create jobs';
      
      toast({
        title: 'Error Creating Jobs',
        description: errorMessage,
        variant: 'destructive',
      });

      return { success: false, error: errorMessage };
    } finally {
      setIsSending(false);
    }
  };

  return { sendToJobBoard, isSending };
}
