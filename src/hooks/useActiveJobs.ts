import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { PipelineJob } from '@/types/pipeline-jobs';

interface UseActiveJobsReturn {
  activeJobs: PipelineJob[];
  recentJobs: PipelineJob[];
  activeCount: number;
  totalProgress: { done: number; total: number };
  isLoading: boolean;
  refetch: () => Promise<void>;
}

export function useActiveJobs(): UseActiveJobsReturn {
  const [activeJobs, setActiveJobs] = useState<PipelineJob[]>([]);
  const [recentJobs, setRecentJobs] = useState<PipelineJob[]>([]);
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

      setActiveJobs((active || []) as PipelineJob[]);
      setRecentJobs((recent || []) as PipelineJob[]);
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

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

  // Calculate aggregate progress
  const totalProgress = activeJobs.reduce(
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
    totalProgress,
    isLoading,
    refetch: fetchJobs,
  };
}
