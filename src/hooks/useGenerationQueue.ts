import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { VIEW_LABELS, ViewType } from "@/types/face-application";

export interface QueueItem {
  id: string;
  lookId: string;
  lookName: string;
  view: string;
  viewLabel: string;
  type: 'generate' | 'regenerate';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  jobId?: string;
  outputIds?: string[];
  error?: string;
}

interface UseGenerationQueueOptions {
  projectId: string;
  onComplete?: () => void;
}

export function useGenerationQueue({ projectId, onComplete }: UseGenerationQueueOptions) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Process queue items one at a time
  useEffect(() => {
    if (isProcessing) return;
    
    const nextItem = queue.find(q => q.status === 'queued');
    if (!nextItem) return;

    processItem(nextItem);
  }, [queue, isProcessing]);

  const processItem = async (item: QueueItem) => {
    setIsProcessing(true);
    updateItemStatus(item.id, 'processing');

    try {
      if (item.type === 'regenerate' && item.outputIds && item.outputIds.length > 0) {
        // Regenerate existing outputs
        for (const outputId of item.outputIds) {
          await supabase.functions.invoke("regenerate-face-output", {
            body: { outputId },
          });
        }
      } else if (item.type === 'generate') {
        // Generate new view - need to find/create job
        let jobId = item.jobId;

        if (!jobId) {
          // Find existing job for this look
          const { data: existingJob } = await supabase
            .from("face_application_jobs")
            .select("id, digital_talent_id")
            .eq("look_id", item.lookId)
            .eq("project_id", projectId)
            .limit(1)
            .maybeSingle();

          if (existingJob) {
            jobId = existingJob.id;
          } else {
            // Create new job
            const { data: srcImg } = await supabase
              .from("look_source_images")
              .select("digital_talent_id")
              .eq("look_id", item.lookId)
              .not("digital_talent_id", "is", null)
              .limit(1)
              .maybeSingle();

            const talentId = srcImg?.digital_talent_id;
            if (!talentId) {
              throw new Error("No talent assigned to this look");
            }

            const { data: newJob, error: jobError } = await supabase
              .from("face_application_jobs")
              .insert({
                project_id: projectId,
                look_id: item.lookId,
                digital_talent_id: talentId,
                status: "pending",
                attempts_per_view: 4,
                progress: 0,
                total: 4,
              })
              .select("id")
              .single();

            if (jobError || !newJob) {
              throw new Error(jobError?.message || "Failed to create job");
            }
            jobId = newJob.id;
          }
        }

        // Call edge function
        const { error: invokeError } = await supabase.functions.invoke("generate-face-application", {
          body: {
            jobId,
            singleView: item.view,
            attemptsPerView: 4,
            outfitDescriptions: {},
          },
        });

        if (invokeError) {
          throw invokeError;
        }
      }

      updateItemStatus(item.id, 'completed');
      onComplete?.();
    } catch (error: any) {
      // Provide friendlier error messages
      const errorMessage = error.message || 'Unknown error';
      let friendlyMessage = errorMessage;
      
      if (errorMessage.includes('No source images')) {
        friendlyMessage = 'Missing head crop for this view';
      } else if (errorMessage.includes('No talent assigned')) {
        friendlyMessage = 'No talent assigned to this look';
      }
      
      updateItemStatus(item.id, 'failed', friendlyMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const updateItemStatus = (id: string, status: QueueItem['status'], error?: string) => {
    setQueue(prev => prev.map(q => 
      q.id === id ? { ...q, status, error } : q
    ));
  };

  const addToQueue = useCallback((
    type: 'generate' | 'regenerate',
    lookId: string,
    lookName: string,
    view: string,
    jobId?: string,
    outputIds?: string[]
  ) => {
    // Check for duplicates
    const exists = queue.some(
      q => q.lookId === lookId && 
           q.view === view && 
           (q.status === 'queued' || q.status === 'processing')
    );

    if (exists) {
      return false;
    }

    const newItem: QueueItem = {
      id: crypto.randomUUID(),
      lookId,
      lookName,
      view,
      viewLabel: VIEW_LABELS[view as ViewType] || view,
      type,
      status: 'queued',
      jobId,
      outputIds,
    };

    setQueue(prev => [...prev, newItem]);
    return true;
  }, [queue]);

  const removeFromQueue = useCallback((id: string) => {
    setQueue(prev => prev.filter(q => q.id !== id || q.status === 'processing'));
  }, []);

  const clearQueue = useCallback(() => {
    setQueue(prev => prev.filter(q => q.status === 'processing'));
  }, []);

  const clearCompleted = useCallback(() => {
    setQueue(prev => prev.filter(q => q.status !== 'completed' && q.status !== 'failed'));
  }, []);

  const pendingCount = queue.filter(q => q.status === 'queued').length;
  const processingItem = queue.find(q => q.status === 'processing');
  const completedCount = queue.filter(q => q.status === 'completed').length;
  const failedCount = queue.filter(q => q.status === 'failed').length;

  return {
    queue,
    isProcessing,
    pendingCount,
    processingItem,
    completedCount,
    failedCount,
    addToQueue,
    removeFromQueue,
    clearQueue,
    clearCompleted,
  };
}
