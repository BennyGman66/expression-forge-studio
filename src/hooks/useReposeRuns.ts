import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export interface ReposeRun {
  id: string;
  batch_id: string;
  look_id: string;
  brand_id: string | null;
  run_index: number;
  status: 'queued' | 'running' | 'complete' | 'failed' | 'cancelled';
  config_snapshot: Json | null;
  error_message: string | null;
  output_count: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  heartbeat_at: string | null;
}

// Fetch run history for a specific look (optionally scoped to a brand)
export function useLookReposeRuns(lookId: string | undefined, brandId?: string) {
  return useQuery({
    queryKey: ['repose-runs', 'look', lookId, brandId],
    queryFn: async () => {
      if (!lookId) return [];
      
      let query = supabase
        .from('repose_runs')
        .select('*')
        .eq('look_id', lookId)
        .order('created_at', { ascending: false });
      
      if (brandId) {
        query = query.eq('brand_id', brandId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as ReposeRun[];
    },
    enabled: !!lookId,
  });
}

// Get run counts per look (for displaying "Rendered: N runs")
export function useReposeRunCounts(lookIds: string[], brandId?: string) {
  return useQuery({
    queryKey: ['repose-run-counts', lookIds, brandId],
    queryFn: async () => {
      if (!lookIds.length) return {};
      
      let query = supabase
        .from('repose_runs')
        .select('look_id, status')
        .in('look_id', lookIds)
        .eq('status', 'complete');
      
      if (brandId) {
        query = query.eq('brand_id', brandId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Count completed runs per look
      const counts: Record<string, number> = {};
      for (const run of data || []) {
        counts[run.look_id] = (counts[run.look_id] || 0) + 1;
      }
      return counts;
    },
    enabled: lookIds.length > 0,
  });
}

// Get last run info per look
export function useLastReposeRuns(lookIds: string[], brandId?: string) {
  return useQuery({
    queryKey: ['repose-last-runs', lookIds, brandId],
    queryFn: async () => {
      if (!lookIds.length) return {};
      
      let query = supabase
        .from('repose_runs')
        .select('*')
        .in('look_id', lookIds)
        .order('created_at', { ascending: false });
      
      if (brandId) {
        query = query.eq('brand_id', brandId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Get most recent run per look
      const lastRuns: Record<string, ReposeRun> = {};
      for (const run of data || []) {
        if (!lastRuns[run.look_id]) {
          lastRuns[run.look_id] = run as ReposeRun;
        }
      }
      return lastRuns;
    },
    enabled: lookIds.length > 0,
  });
}

// Fetch all runs for a batch
export function useBatchReposeRuns(batchId: string | undefined) {
  return useQuery({
    queryKey: ['repose-runs', 'batch', batchId],
    queryFn: async () => {
      if (!batchId) return [];
      
      const { data, error } = await supabase
        .from('repose_runs')
        .select('*')
        .eq('batch_id', batchId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data as ReposeRun[];
    },
    enabled: !!batchId,
    refetchInterval: 5000, // Poll every 5 seconds while active
    staleTime: 2000, // Consider data stale after 2 seconds
  });
}

// Create new run records
export function useCreateReposeRuns() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (runs: Array<{
      batch_id: string;
      look_id: string;
      brand_id: string;
      run_index: number;
      config_snapshot?: Json;
    }>) => {
      const { data, error } = await supabase
        .from('repose_runs')
        .insert(runs)
        .select();
      
      if (error) throw error;
      return data as ReposeRun[];
    },
    onSuccess: (_, variables) => {
      const batchId = variables[0]?.batch_id;
      if (batchId) {
        queryClient.invalidateQueries({ queryKey: ['repose-runs', 'batch', batchId] });
      }
      queryClient.invalidateQueries({ queryKey: ['repose-run-counts'] });
      queryClient.invalidateQueries({ queryKey: ['repose-last-runs'] });
    },
  });
}

// Update run status
export function useUpdateReposeRun() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      runId, 
      updates 
    }: { 
      runId: string; 
      updates: {
        status?: string;
        error_message?: string | null;
        output_count?: number;
        started_at?: string | null;
        completed_at?: string | null;
        heartbeat_at?: string | null;
        config_snapshot?: Json | null;
      }; 
    }) => {
      const { data, error } = await supabase
        .from('repose_runs')
        .update(updates)
        .eq('id', runId)
        .select()
        .single();
      
      if (error) throw error;
      return data as ReposeRun;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['repose-runs', 'batch', data.batch_id] });
      queryClient.invalidateQueries({ queryKey: ['repose-runs', 'look', data.look_id] });
      queryClient.invalidateQueries({ queryKey: ['repose-run-counts'] });
      queryClient.invalidateQueries({ queryKey: ['repose-last-runs'] });
    },
  });
}

// Update heartbeat for running jobs
export function useUpdateHeartbeat() {
  return useMutation({
    mutationFn: async (runIds: string[]) => {
      if (!runIds.length) return;
      
      const { error } = await supabase
        .from('repose_runs')
        .update({ heartbeat_at: new Date().toISOString() })
        .in('id', runIds);
      
      if (error) throw error;
    },
  });
}

// Mark stalled runs as failed
export function useDetectStalledRuns() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (stalledThresholdMinutes: number = 5) => {
      const thresholdTime = new Date(Date.now() - stalledThresholdMinutes * 60 * 1000).toISOString();
      
      const { data, error } = await supabase
        .from('repose_runs')
        .update({ 
          status: 'failed', 
          error_message: 'Job stalled - no heartbeat' 
        })
        .eq('status', 'running')
        .lt('heartbeat_at', thresholdTime)
        .select();
      
      if (error) throw error;
      return data as ReposeRun[];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repose-runs'] });
      queryClient.invalidateQueries({ queryKey: ['repose-run-counts'] });
      queryClient.invalidateQueries({ queryKey: ['repose-last-runs'] });
    },
  });
}

// Get next run index for a look in a batch
export async function getNextRunIndex(batchId: string, lookId: string): Promise<number> {
  const { data, error } = await supabase
    .from('repose_runs')
    .select('run_index')
    .eq('batch_id', batchId)
    .eq('look_id', lookId)
    .order('run_index', { ascending: false })
    .limit(1);
  
  if (error) throw error;
  return (data?.[0]?.run_index || 0) + 1;
}
