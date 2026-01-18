import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { WorkflowQueueItem } from '@/types/optimised-workflow';
import { useToast } from '@/hooks/use-toast';

const STALL_THRESHOLD_MINUTES = 10;

export function useWorkflowQueue(projectId: string | null) {
  return useQuery({
    queryKey: ['workflow-queue', projectId],
    queryFn: async (): Promise<WorkflowQueueItem[]> => {
      if (!projectId) return [];

      const { data, error } = await supabase
        .from('workflow_queue')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as WorkflowQueueItem[];
    },
    enabled: !!projectId,
    refetchInterval: 5000, // Poll every 5 seconds
  });
}

export function useStalledJobs(projectId: string | null) {
  return useQuery({
    queryKey: ['workflow-stalled-jobs', projectId],
    queryFn: async (): Promise<WorkflowQueueItem[]> => {
      if (!projectId) return [];

      const stallThreshold = new Date(
        Date.now() - STALL_THRESHOLD_MINUTES * 60 * 1000
      ).toISOString();

      const { data, error } = await supabase
        .from('workflow_queue')
        .select('*')
        .eq('project_id', projectId)
        .eq('status', 'running')
        .lt('heartbeat_at', stallThreshold);

      if (error) throw error;
      return (data || []) as WorkflowQueueItem[];
    },
    enabled: !!projectId,
    refetchInterval: 30000, // Check every 30 seconds
  });
}

export function useGlobalStalledCount() {
  return useQuery({
    queryKey: ['workflow-stalled-count-global'],
    queryFn: async (): Promise<number> => {
      const stallThreshold = new Date(
        Date.now() - STALL_THRESHOLD_MINUTES * 60 * 1000
      ).toISOString();

      const { count, error } = await supabase
        .from('workflow_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'running')
        .lt('heartbeat_at', stallThreshold);

      if (error) throw error;
      return count || 0;
    },
    refetchInterval: 30000,
  });
}

export function useRetryQueueItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (itemId: string) => {
      const { data, error } = await supabase
        .from('workflow_queue')
        .update({
          status: 'queued',
          attempts: 0,
          error_message: null,
          started_at: null,
          heartbeat_at: new Date().toISOString(),
        })
        .eq('id', itemId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-queue'] });
      queryClient.invalidateQueries({ queryKey: ['workflow-stalled-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['workflow-stalled-count-global'] });
      toast({
        title: 'Job requeued',
        description: 'The job has been added back to the queue.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error retrying job',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useRetryAllStalled() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (projectId: string) => {
      const stallThreshold = new Date(
        Date.now() - STALL_THRESHOLD_MINUTES * 60 * 1000
      ).toISOString();

      const { data, error } = await supabase
        .from('workflow_queue')
        .update({
          status: 'queued',
          attempts: 0,
          error_message: null,
          started_at: null,
          heartbeat_at: new Date().toISOString(),
        })
        .eq('project_id', projectId)
        .eq('status', 'running')
        .lt('heartbeat_at', stallThreshold)
        .select();

      if (error) throw error;
      return data?.length || 0;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['workflow-queue'] });
      queryClient.invalidateQueries({ queryKey: ['workflow-stalled-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['workflow-stalled-count-global'] });
      toast({
        title: 'Jobs requeued',
        description: `${count} stalled jobs have been added back to the queue.`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Error retrying jobs',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useCancelQueueItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from('workflow_queue')
        .delete()
        .eq('id', itemId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-queue'] });
      queryClient.invalidateQueries({ queryKey: ['workflow-stalled-jobs'] });
      toast({
        title: 'Job cancelled',
        description: 'The job has been removed from the queue.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error cancelling job',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
