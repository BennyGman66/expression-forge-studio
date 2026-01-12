import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { PipelineJob, PipelineJobStatus } from '@/types/pipeline-jobs';

// Jobs are considered stalled if not updated in 5 minutes
const STALL_THRESHOLD_MS = 5 * 60 * 1000;
// Paused jobs are considered abandoned after 1 hour
const ABANDONED_THRESHOLD_MS = 60 * 60 * 1000;

export interface EnhancedPipelineJob extends PipelineJob {
  isStalled: boolean;
  isAbandoned: boolean;
}

export interface UseActiveJobsReturn {
  activeJobs: EnhancedPipelineJob[];
  recentJobs: EnhancedPipelineJob[];
  activeCount: number;
  runningCount: number;
  pausedCount: number;
  stalledCount: number;
  totalProgress: { done: number; total: number };
  isLoading: boolean;
  refetch: () => Promise<void>;
  markJobStalled: (jobId: string) => Promise<void>;
}

function enhanceJob(job: PipelineJob): EnhancedPipelineJob {
  const updatedAt = new Date(job.updated_at).getTime();
  const now = Date.now();
  const isStalled = job.status === 'RUNNING' && (now - updatedAt) > STALL_THRESHOLD_MS;
  const isAbandoned = job.status === 'PAUSED' && (now - updatedAt) > ABANDONED_THRESHOLD_MS;
  return { ...job, isStalled, isAbandoned };
}

export function useActiveJobs(): UseActiveJobsReturn {
  const [activeJobs, setActiveJobs] = useState<EnhancedPipelineJob[]>([]);
  const [recentJobs, setRecentJobs] = useState<EnhancedPipelineJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchJobs = useCallback(async () => {
    try {
      // Fetch active jobs (QUEUED, RUNNING, PAUSED)
      const { data: active, error: activeError } = await supabase
        .from('pipeline_jobs')
        .select('*')
        .in('status', ['QUEUED', 'RUNNING', 'PAUSED'])
        .order('created_at', { ascending: false });

      if (activeError) throw activeError;

      // Fetch recent completed jobs (last 24 hours)
      const oneDayAgo = new Date();
      oneDayAgo.setHours(oneDayAgo.getHours() - 24);

      const { data: recent, error: recentError } = await supabase
        .from('pipeline_jobs')
        .select('*')
        .in('status', ['COMPLETED', 'FAILED', 'CANCELED'])
        .gte('completed_at', oneDayAgo.toISOString())
        .order('completed_at', { ascending: false })
        .limit(10);

      if (recentError) throw recentError;

      setActiveJobs((active || []).map(j => enhanceJob(j as PipelineJob)));
      setRecentJobs((recent || []).map(j => enhanceJob(j as PipelineJob)));
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Mark a job as failed due to stall
  const markJobStalled = useCallback(async (jobId: string) => {
    const { error } = await supabase
      .from('pipeline_jobs')
      .update({ 
        status: 'FAILED' as PipelineJobStatus,
        progress_message: 'Stalled - user navigated away',
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId);
    
    if (error) {
      console.error('Failed to mark job as stalled:', error);
    } else {
      await fetchJobs();
    }
  }, [fetchJobs]);

  // Initial fetch
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('pipeline-jobs-tracker')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pipeline_jobs',
        },
        () => {
          // Refetch on any change
          fetchJobs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchJobs]);

  // Periodically check for stalled jobs (every 30 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveJobs(prev => prev.map(job => enhanceJob(job)));
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Calculate counts
  const runningJobs = activeJobs.filter(j => j.status === 'RUNNING' || j.status === 'QUEUED');
  const pausedJobs = activeJobs.filter(j => j.status === 'PAUSED');
  const stalledJobs = activeJobs.filter(j => j.isStalled);

  // Calculate aggregate progress - only for actively running jobs (not paused)
  const totalProgress = runningJobs.reduce(
    (acc, job) => ({
      done: acc.done + job.progress_done,
      total: acc.total + job.progress_total,
    }),
    { done: 0, total: 0 }
  );

  return {
    activeJobs,
    recentJobs,
    activeCount: activeJobs.length,
    runningCount: runningJobs.length,
    pausedCount: pausedJobs.length,
    stalledCount: stalledJobs.length,
    totalProgress,
    isLoading,
    refetch: fetchJobs,
    markJobStalled,
  };
}
