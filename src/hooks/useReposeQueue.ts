import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePipelineJobs } from '@/hooks/usePipelineJobs';
import { ReposeConfig, DEFAULT_REPOSE_MODEL } from '@/types/repose';
import type { Json } from '@/integrations/supabase/types';

export interface ReposeQueueItem {
  id: string;
  runId: string;
  lookId: string;
  lookName: string;
  runIndex: number;
  status: 'queued' | 'running' | 'complete' | 'failed' | 'cancelled';
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  outputsGenerated?: number;
}

interface UseReposeQueueOptions {
  batchId: string | undefined;
  brandId: string | undefined;
  config: ReposeConfig;
  concurrency?: number;
  onRunComplete?: (runId: string) => void;
  onAllComplete?: () => void;
}

export function useReposeQueue({
  batchId,
  brandId,
  config,
  concurrency = 3,
  onRunComplete,
  onAllComplete,
}: UseReposeQueueOptions) {
  const [queue, setQueue] = useState<ReposeQueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const shouldStopRef = useRef(false);
  const activeWorkersRef = useRef(0);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pipelineJobIdRef = useRef<string | null>(null);
  
  const { createJob, updateProgress, setStatus } = usePipelineJobs();

  // Get counts
  const queuedCount = queue.filter(i => i.status === 'queued').length;
  const runningCount = queue.filter(i => i.status === 'running').length;
  const completeCount = queue.filter(i => i.status === 'complete').length;
  const failedCount = queue.filter(i => i.status === 'failed').length;
  const totalCount = queue.length;

  // Update item status
  const updateItemStatus = useCallback((
    runId: string, 
    status: ReposeQueueItem['status'], 
    extra?: Partial<ReposeQueueItem>
  ) => {
    setQueue(prev => prev.map(item => 
      item.runId === runId ? { ...item, status, ...extra } : item
    ));
  }, []);

  // Heartbeat: update running jobs every 30 seconds
  useEffect(() => {
    if (!isProcessing) {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      return;
    }

    heartbeatIntervalRef.current = setInterval(async () => {
      const runningItems = queue.filter(i => i.status === 'running');
      if (!runningItems.length) return;

      const runIds = runningItems.map(i => i.runId);
      await supabase
        .from('repose_runs')
        .update({ heartbeat_at: new Date().toISOString() })
        .in('id', runIds);
    }, 30000);

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, [isProcessing, queue]);

  // Stall detection: check for jobs stuck in running state
  useEffect(() => {
    if (!isProcessing) return;

    const checkStalled = setInterval(async () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      
      const { data: stalledRuns } = await supabase
        .from('repose_runs')
        .select('id')
        .eq('status', 'running')
        .lt('heartbeat_at', fiveMinutesAgo);
      
      if (stalledRuns?.length) {
        await supabase
          .from('repose_runs')
          .update({ status: 'failed', error_message: 'Job stalled - no heartbeat' })
          .in('id', stalledRuns.map(r => r.id));
        
        for (const run of stalledRuns) {
          updateItemStatus(run.id, 'failed', { error: 'Job stalled - no heartbeat' });
        }
      }
    }, 60000);

    return () => clearInterval(checkStalled);
  }, [isProcessing, updateItemStatus]);

  // Process a single run
  const processRun = useCallback(async (item: ReposeQueueItem) => {
    const model = config.model || DEFAULT_REPOSE_MODEL;
    
    try {
      // Mark as running in DB
      await supabase
        .from('repose_runs')
        .update({ 
          status: 'running', 
          started_at: new Date().toISOString(),
          heartbeat_at: new Date().toISOString(),
        })
        .eq('id', item.runId);
      
      updateItemStatus(item.runId, 'running', { startedAt: new Date() });

      // Get batch items for this look
      const { data: batchItems } = await supabase
        .from('repose_batch_items')
        .select('id, view, source_url')
        .eq('batch_id', batchId)
        .eq('look_id', item.lookId);

      if (!batchItems?.length) {
        throw new Error('No batch items found for look');
      }

      // Get poses for generation based on shot types
      const { data: poses } = await supabase
        .from('library_poses')
        .select(`
          id,
          slot,
          product_type,
          clay_images (id, stored_url)
        `)
        .eq('curation_status', 'approved')
        .not('clay_images', 'is', null);

      // Create repose outputs for this run
      const outputsToCreate: Array<{
        batch_id: string;
        batch_item_id: string;
        pose_id: string | null;
        shot_type: string;
        attempt_index: number;
        status: string;
        run_id: string;
      }> = [];

      const posesPerShotType = config.posesPerShotType || 2;
      const attemptsPerPose = config.attemptsPerPose || 1;

      for (const batchItem of batchItems) {
        // For each batch item, create outputs based on view mapping
        const view = batchItem.view?.toLowerCase() || '';
        let shotTypes: string[] = [];
        
        if (view.includes('front')) {
          shotTypes = ['FRONT_FULL', 'FRONT_CROPPED'];
        } else if (view.includes('back')) {
          shotTypes = ['BACK_FULL'];
        } else if (view.includes('detail')) {
          shotTypes = ['DETAIL'];
        }

        for (const shotType of shotTypes) {
          // Get random poses for this shot type
          const relevantPoses = (poses || [])
            .filter(p => p.slot?.toUpperCase().includes(shotType.split('_')[0]) || true)
            .slice(0, posesPerShotType);

          for (let poseIdx = 0; poseIdx < Math.min(posesPerShotType, relevantPoses.length || 1); poseIdx++) {
            for (let attempt = 0; attempt < attemptsPerPose; attempt++) {
              outputsToCreate.push({
                batch_id: batchId!,
                batch_item_id: batchItem.id,
                pose_id: relevantPoses[poseIdx]?.id || null,
                shot_type: shotType,
                attempt_index: attempt,
                status: 'queued',
                run_id: item.runId,
              });
            }
          }
        }
      }

      // Insert outputs
      if (outputsToCreate.length > 0) {
        const { error: insertError } = await supabase
          .from('repose_outputs')
          .insert(outputsToCreate);
        
        if (insertError) throw insertError;
      }

      // Process each output by calling generate-repose-single
      const { data: outputs } = await supabase
        .from('repose_outputs')
        .select('id')
        .eq('run_id', item.runId)
        .eq('status', 'queued');

      let successCount = 0;
      let failCount = 0;

      for (const output of outputs || []) {
        if (shouldStopRef.current) break;

        try {
          const { error } = await supabase.functions.invoke('generate-repose-single', {
            body: { outputId: output.id, model },
          });
          
          if (error) {
            failCount++;
          } else {
            successCount++;
          }
        } catch {
          failCount++;
        }

        // Update heartbeat during processing
        await supabase
          .from('repose_runs')
          .update({ heartbeat_at: new Date().toISOString() })
          .eq('id', item.runId);
      }

      // Mark run as complete
      const finalStatus = failCount === outputs?.length ? 'failed' : 'complete';
      await supabase
        .from('repose_runs')
        .update({ 
          status: finalStatus, 
          completed_at: new Date().toISOString(),
          output_count: successCount,
        })
        .eq('id', item.runId);

      updateItemStatus(item.runId, finalStatus, { 
        completedAt: new Date(), 
        outputsGenerated: successCount 
      });
      
      onRunComplete?.(item.runId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      await supabase
        .from('repose_runs')
        .update({ 
          status: 'failed', 
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq('id', item.runId);
      
      updateItemStatus(item.runId, 'failed', { error: errorMessage });
    }
  }, [batchId, config, updateItemStatus, onRunComplete]);

  // Worker loop
  const runWorker = useCallback(async () => {
    activeWorkersRef.current++;
    
    while (!shouldStopRef.current) {
      // Find next queued item
      const nextItem = queue.find(i => i.status === 'queued');
      if (!nextItem) break;
      
      // Mark as running locally first to prevent duplicate pickup
      updateItemStatus(nextItem.runId, 'running');
      
      await processRun(nextItem);
      
      // Update pipeline job progress
      if (pipelineJobIdRef.current) {
        const completed = queue.filter(i => i.status === 'complete').length;
        const failed = queue.filter(i => i.status === 'failed').length;
        await updateProgress(pipelineJobIdRef.current, { done: completed, failed });
      }
    }
    
    activeWorkersRef.current--;
    
    // Check if all workers done
    if (activeWorkersRef.current === 0) {
      setIsProcessing(false);
      
      if (pipelineJobIdRef.current) {
        const hasFailures = queue.some(i => i.status === 'failed');
        await setStatus(pipelineJobIdRef.current, hasFailures ? 'FAILED' : 'COMPLETED');
      }
      
      onAllComplete?.();
    }
  }, [queue, processRun, updateItemStatus, updateProgress, setStatus, onAllComplete]);

  // Start processing
  const startProcessing = useCallback(async () => {
    if (isProcessing || !batchId) return;
    
    shouldStopRef.current = false;
    setIsProcessing(true);
    
    // Create pipeline job
    const jobId = await createJob({
      type: 'REPOSE_GENERATION',
      title: 'Repose Generation',
      total: totalCount,
      origin_route: '/repose-production',
      origin_context: { batchId, model: config.model || DEFAULT_REPOSE_MODEL },
    });
    pipelineJobIdRef.current = jobId;
    
    // Start workers up to concurrency limit
    const workerCount = Math.min(concurrency, queuedCount);
    for (let i = 0; i < workerCount; i++) {
      runWorker();
    }
  }, [isProcessing, batchId, totalCount, queuedCount, concurrency, createJob, config, runWorker]);

  // Stop processing
  const stopProcessing = useCallback(() => {
    shouldStopRef.current = true;
  }, []);

  // Add runs to queue
  const addToQueue = useCallback(async (
    looks: Array<{ id: string; name: string }>,
    runsPerLook: number
  ): Promise<void> => {
    if (!batchId || !brandId) return;

    const newItems: ReposeQueueItem[] = [];
    const runsToInsert: Array<{
      batch_id: string;
      look_id: string;
      brand_id: string;
      run_index: number;
      config_snapshot: Json;
    }> = [];

    for (const look of looks) {
      // Get current max run index for this look
      const { data: existingRuns } = await supabase
        .from('repose_runs')
        .select('run_index')
        .eq('batch_id', batchId)
        .eq('look_id', look.id)
        .order('run_index', { ascending: false })
        .limit(1);
      
      const startIndex = (existingRuns?.[0]?.run_index || 0) + 1;

      for (let i = 0; i < runsPerLook; i++) {
        const runIndex = startIndex + i;
        
        // Check for duplicates
        const isDuplicate = queue.some(
          q => q.lookId === look.id && q.runIndex === runIndex && 
               ['queued', 'running'].includes(q.status)
        );
        
        if (isDuplicate) continue;

        runsToInsert.push({
          batch_id: batchId,
          look_id: look.id,
          brand_id: brandId,
          run_index: runIndex,
          config_snapshot: config as unknown as Json,
        });
      }
    }

    if (!runsToInsert.length) return;

    // Insert runs into DB
    const { data: insertedRuns, error } = await supabase
      .from('repose_runs')
      .insert(runsToInsert)
      .select();

    if (error) throw error;

    // Add to local queue
    for (const run of insertedRuns || []) {
      const look = looks.find(l => l.id === run.look_id);
      newItems.push({
        id: crypto.randomUUID(),
        runId: run.id,
        lookId: run.look_id,
        lookName: look?.name || 'Unknown',
        runIndex: run.run_index,
        status: 'queued',
      });
    }

    setQueue(prev => [...prev, ...newItems]);
  }, [batchId, brandId, config, queue]);

  // Retry failed runs
  const retryFailed = useCallback(async () => {
    const failedItems = queue.filter(i => i.status === 'failed');
    
    for (const item of failedItems) {
      await supabase
        .from('repose_runs')
        .update({ 
          status: 'queued', 
          error_message: null,
          started_at: null,
          completed_at: null,
        })
        .eq('id', item.runId);
      
      updateItemStatus(item.runId, 'queued', { error: undefined });
    }
    
    if (!isProcessing && failedItems.length > 0) {
      startProcessing();
    }
  }, [queue, isProcessing, updateItemStatus, startProcessing]);

  // Retry single run
  const retrySingle = useCallback(async (runId: string) => {
    await supabase
      .from('repose_runs')
      .update({ 
        status: 'queued', 
        error_message: null,
        started_at: null,
        completed_at: null,
      })
      .eq('id', runId);
    
    updateItemStatus(runId, 'queued', { error: undefined });
    
    if (!isProcessing) {
      startProcessing();
    }
  }, [isProcessing, updateItemStatus, startProcessing]);

  // Clear completed items from queue
  const clearCompleted = useCallback(() => {
    setQueue(prev => prev.filter(i => !['complete', 'failed'].includes(i.status)));
  }, []);

  // Clear all items
  const clearQueue = useCallback(() => {
    setQueue([]);
  }, []);

  // Load existing runs for batch on mount
  useEffect(() => {
    if (!batchId) return;
    
    const loadExistingRuns = async () => {
      const { data: runs } = await supabase
        .from('repose_runs')
        .select(`
          *,
          talent_looks(name)
        `)
        .eq('batch_id', batchId)
        .in('status', ['queued', 'running'])
        .order('created_at', { ascending: true });
      
      if (runs?.length) {
        const items: ReposeQueueItem[] = runs.map(run => ({
          id: crypto.randomUUID(),
          runId: run.id,
          lookId: run.look_id,
          lookName: (run as unknown as { talent_looks: { name: string } | null }).talent_looks?.name || 'Unknown',
          runIndex: run.run_index,
          status: run.status as ReposeQueueItem['status'],
          error: run.error_message || undefined,
          startedAt: run.started_at ? new Date(run.started_at) : undefined,
        }));
        setQueue(items);
      }
    };
    
    loadExistingRuns();
  }, [batchId]);

  return {
    queue,
    isProcessing,
    queuedCount,
    runningCount,
    completeCount,
    failedCount,
    totalCount,
    addToQueue,
    startProcessing,
    stopProcessing,
    retryFailed,
    retrySingle,
    clearCompleted,
    clearQueue,
  };
}
