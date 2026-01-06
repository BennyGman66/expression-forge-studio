import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { 
  PipelineJob, 
  PipelineJobStatus, 
  CreateJobParams, 
  UpdateProgressParams 
} from '@/types/pipeline-jobs';

export function usePipelineJobs() {
  const { user } = useAuth();

  const createJob = useCallback(async (params: CreateJobParams): Promise<string> => {
    const { data, error } = await supabase
      .from('pipeline_jobs')
      .insert({
        type: params.type as string,
        title: params.title,
        status: 'RUNNING',
        progress_total: params.total,
        progress_done: 0,
        progress_failed: 0,
        origin_route: params.origin_route,
        origin_context: params.origin_context || {},
        supports_pause: params.supports_pause ?? false,
        supports_retry: params.supports_retry ?? false,
        supports_restart: params.supports_restart ?? true,
        source_table: params.source_table,
        source_job_id: params.source_job_id,
        created_by: user?.id,
        started_at: new Date().toISOString(),
      } as any)
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  }, [user?.id]);

  const updateProgress = useCallback(async (
    jobId: string, 
    params: UpdateProgressParams
  ): Promise<void> => {
    const updates: Record<string, unknown> = {};
    
    if (params.message !== undefined) {
      updates.progress_message = params.message;
    }

    // Handle absolute values
    if (params.done !== undefined) {
      updates.progress_done = params.done;
    }
    if (params.failed !== undefined) {
      updates.progress_failed = params.failed;
    }

    // Handle delta values - need to fetch current first
    if (params.doneDelta !== undefined || params.failedDelta !== undefined) {
      const { data: current } = await supabase
        .from('pipeline_jobs')
        .select('progress_done, progress_failed')
        .eq('id', jobId)
        .single();

      if (current) {
        if (params.doneDelta !== undefined) {
          updates.progress_done = current.progress_done + params.doneDelta;
        }
        if (params.failedDelta !== undefined) {
          updates.progress_failed = current.progress_failed + params.failedDelta;
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from('pipeline_jobs')
        .update(updates)
        .eq('id', jobId);

      if (error) throw error;
    }
  }, []);

  const setStatus = useCallback(async (
    jobId: string, 
    status: PipelineJobStatus
  ): Promise<void> => {
    const updates: Record<string, unknown> = { status };
    
    if (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELED') {
      updates.completed_at = new Date().toISOString();
    }
    if (status === 'RUNNING') {
      updates.started_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('pipeline_jobs')
      .update(updates)
      .eq('id', jobId);

    if (error) throw error;
  }, []);

  const pauseJob = useCallback(async (jobId: string): Promise<void> => {
    await setStatus(jobId, 'PAUSED');
  }, [setStatus]);

  const resumeJob = useCallback(async (jobId: string): Promise<void> => {
    await setStatus(jobId, 'RUNNING');
  }, [setStatus]);

  const logEvent = useCallback(async (
    jobId: string,
    level: 'info' | 'warn' | 'error',
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void> => {
    const { error } = await supabase
      .from('pipeline_job_events')
      .insert({
        job_id: jobId,
        level,
        message,
        metadata: metadata || {},
      } as any);

    if (error) console.error('Failed to log job event:', error);
  }, []);

  const getJob = useCallback(async (jobId: string): Promise<PipelineJob | null> => {
    const { data, error } = await supabase
      .from('pipeline_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error) return null;
    return data as PipelineJob;
  }, []);

  // Check if a job is stalled (running but no updates in 10+ minutes)
  const isJobStalled = (job: PipelineJob): boolean => {
    if (job.status !== 'RUNNING') return false;
    const updatedAt = new Date(job.updated_at).getTime();
    const stalledThreshold = 10 * 60 * 1000; // 10 minutes
    return Date.now() - updatedAt > stalledThreshold;
  };

  return {
    createJob,
    updateProgress,
    setStatus,
    pauseJob,
    resumeJob,
    logEvent,
    getJob,
    isJobStalled,
  };
}
