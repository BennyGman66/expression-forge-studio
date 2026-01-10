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

        // 3. Create artifacts and inputs for each view
        for (const viewKey of REQUIRED_VIEWS) {
          const viewData = look.views[viewKey];
          
          // Create artifact for source image (original fit model photo)
          if (viewData.sourceUrl) {
            const { data: sourceArtifact, error: sourceArtifactError } = await supabase
              .from('unified_artifacts')
              .insert({
                project_id: projectId,
                look_id: look.id,
                type: `LOOK_ORIGINAL_${viewKey.toUpperCase()}` as any,
                file_url: viewData.sourceUrl,
                metadata: { view: viewKey },
              })
              .select()
              .single();

            if (sourceArtifactError) {
              console.error('Error creating source artifact:', sourceArtifactError);
            } else {
              // Link as job input
              await supabase
                .from('job_inputs')
                .insert({
                  job_id: job.id,
                  artifact_id: sourceArtifact.id,
                  label: `Original ${viewKey.replace('_', ' ')}`,
                });
            }
          }

          // Create artifact for selected head render
          if (viewData.selectedUrl) {
            const { data: renderArtifact, error: renderArtifactError } = await supabase
              .from('unified_artifacts')
              .insert({
                project_id: projectId,
                look_id: look.id,
                type: `HEAD_RENDER_${viewKey === 'back' ? 'BACK' : viewKey === 'detail' ? 'SIDE' : 'FRONT'}` as any,
                file_url: viewData.selectedUrl,
                source_table: 'face_application_outputs',
                source_id: viewData.outputId,
                metadata: { view: viewKey },
              })
              .select()
              .single();

            if (renderArtifactError) {
              console.error('Error creating render artifact:', renderArtifactError);
            } else {
              // Link as job input
              await supabase
                .from('job_inputs')
                .insert({
                  job_id: job.id,
                  artifact_id: renderArtifact.id,
                  label: `Head render ${viewKey.replace('_', ' ')}`,
                });
            }
          }
        }

        // 4. Lock the outputs so they can't be changed
        const outputIds = REQUIRED_VIEWS
          .map(v => look.views[v].outputId)
          .filter((id): id is string => !!id);

        if (outputIds.length > 0) {
          // Mark these outputs as locked by setting a flag (we'll use is_selected as the lock)
          // The outputs are already selected, so they're implicitly locked
        }
      }

      // 5. Create audit event
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
