import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ReposeBatch, ReposeBatchItem, ReposeOutput, ReposeConfig, DEFAULT_REPOSE_CONFIG } from "@/types/repose";

// Fetch a single batch by ID
export function useReposeBatch(batchId: string | undefined) {
  return useQuery({
    queryKey: ["repose-batch", batchId],
    queryFn: async () => {
      if (!batchId) return null;
      const { data, error } = await supabase
        .from("repose_batches")
        .select("*")
        .eq("id", batchId)
        .maybeSingle();
      if (error) throw error;
      return data as ReposeBatch | null;
    },
    enabled: !!batchId,
  });
}

// Fetch batch by job ID (for checking if one already exists)
export function useReposeBatchByJobId(jobId: string | undefined) {
  return useQuery({
    queryKey: ["repose-batch-by-job", jobId],
    queryFn: async () => {
      if (!jobId) return null;
      const { data, error } = await supabase
        .from("repose_batches")
        .select("*")
        .eq("job_id", jobId)
        .maybeSingle();
      if (error) throw error;
      return data as ReposeBatch | null;
    },
    enabled: !!jobId,
  });
}

// Fetch batch by project ID (for checking if one already exists)
export function useReposeBatchByProjectId(projectId: string | undefined) {
  return useQuery({
    queryKey: ["repose-batch-by-project", projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const { data, error } = await supabase
        .from("repose_batches")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();
      if (error) throw error;
      return data as ReposeBatch | null;
    },
    enabled: !!projectId,
  });
}

// Fetch all batches (for listing)
export function useReposeBatches() {
  return useQuery({
    queryKey: ["repose-batches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("repose_batches")
        .select("*, brands(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

// Extended batch item with look code
export interface ReposeBatchItemWithLook extends ReposeBatchItem {
  look_code?: string | null;
}

// Fetch batch items for a batch with look codes
export function useReposeBatchItems(batchId: string | undefined) {
  return useQuery({
    queryKey: ["repose-batch-items", batchId],
    queryFn: async () => {
      if (!batchId) return [];
      
      // Fetch batch items
      const { data: items, error } = await supabase
        .from("repose_batch_items")
        .select("*")
        .eq("batch_id", batchId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (!items || items.length === 0) return [];
      
      // Get unique look IDs and fetch their codes
      const lookIds = [...new Set(items.map(i => i.look_id).filter(Boolean))] as string[];
      
      let lookCodeMap = new Map<string, string>();
      if (lookIds.length > 0) {
        const { data: looks } = await supabase
          .from("talent_looks")
          .select("id, look_code")
          .in("id", lookIds);
        
        if (looks) {
          for (const look of looks) {
            if (look.look_code) {
              lookCodeMap.set(look.id, look.look_code);
            }
          }
        }
      }
      
      // Merge look codes into batch items
      return items.map(item => ({
        ...item,
        look_code: item.look_id ? lookCodeMap.get(item.look_id) || null : null,
      })) as ReposeBatchItemWithLook[];
    },
    enabled: !!batchId,
  });
}

// Fetch repose outputs for a batch (handles >1000 rows)
export function useReposeOutputs(batchId: string | undefined) {
  return useQuery({
    queryKey: ["repose-outputs", batchId],
    queryFn: async () => {
      if (!batchId) return [];
      
      // Supabase has a default limit of 1000 rows, so we need to paginate
      const PAGE_SIZE = 1000;
      let allOutputs: ReposeOutput[] = [];
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from("repose_outputs")
          .select("*")
          .eq("batch_id", batchId)
          .order("created_at", { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          allOutputs = allOutputs.concat(data as ReposeOutput[]);
          offset += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }
      
      return allOutputs;
    },
    enabled: !!batchId,
  });
}

// Create a new batch from a job OR project
export function useCreateReposeBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      jobId,
      projectId,
      brandId,
      outputs 
    }: { 
      jobId?: string;
      projectId?: string;
      brandId?: string;
      outputs: Array<{ look_id?: string; view: string; source_output_id?: string; source_url: string }>;
    }) => {
      // Create the batch
      const { data: batch, error: batchError } = await supabase
        .from("repose_batches")
        .insert({
          job_id: jobId || null,
          project_id: projectId || null,
          brand_id: brandId || null,
          status: 'DRAFT',
          config_json: {},
        })
        .select()
        .single();

      if (batchError) throw batchError;

      // Create batch items from outputs
      if (outputs.length > 0) {
        const batchItems = outputs.map(output => ({
          batch_id: batch.id,
          look_id: output.look_id || null,
          view: output.view,
          source_output_id: output.source_output_id || null,
          source_url: output.source_url,
        }));

        const { error: itemsError } = await supabase
          .from("repose_batch_items")
          .insert(batchItems);

        if (itemsError) throw itemsError;
      }

      return batch as ReposeBatch;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repose-batches"] });
      toast.success("Repose batch created");
    },
    onError: (error) => {
      toast.error(`Failed to create batch: ${error.message}`);
    },
  });
}

// Update batch config
export function useUpdateReposeBatchConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      batchId, 
      config,
      brandId 
    }: { 
      batchId: string; 
      config?: ReposeConfig;
      brandId?: string;
    }) => {
      const updateData: Record<string, unknown> = {};
      if (config !== undefined) updateData.config_json = config;
      if (brandId !== undefined) updateData.brand_id = brandId;

      const { data, error } = await supabase
        .from("repose_batches")
        .update(updateData)
        .eq("id", batchId)
        .select()
        .single();

      if (error) throw error;
      return data as ReposeBatch;
    },
    onSuccess: (_, { batchId }) => {
      queryClient.invalidateQueries({ queryKey: ["repose-batch", batchId] });
      queryClient.invalidateQueries({ queryKey: ["repose-batches"] });
    },
    onError: (error) => {
      toast.error(`Failed to update batch: ${error.message}`);
    },
  });
}

// Update batch status
export function useUpdateReposeBatchStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      batchId, 
      status 
    }: { 
      batchId: string; 
      status: ReposeBatch['status'];
    }) => {
      const { data, error } = await supabase
        .from("repose_batches")
        .update({ status })
        .eq("id", batchId)
        .select()
        .single();

      if (error) throw error;
      return data as ReposeBatch;
    },
    onSuccess: (_, { batchId }) => {
      queryClient.invalidateQueries({ queryKey: ["repose-batch", batchId] });
      queryClient.invalidateQueries({ queryKey: ["repose-batches"] });
    },
    onError: (error) => {
      toast.error(`Failed to update batch status: ${error.message}`);
    },
  });
}

// Get approved jobs that are eligible for repose
export function useEligibleJobsForRepose() {
  return useQuery({
    queryKey: ["eligible-jobs-for-repose"],
    queryFn: async () => {
      // Get jobs that are APPROVED and have outputs
      const { data: jobs, error } = await supabase
        .from("unified_jobs")
        .select(`
          id,
          title,
          type,
          status,
          created_at,
          job_outputs(id, file_url, label)
        `)
        .eq("status", "APPROVED")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Filter to jobs that have outputs
      return jobs?.filter(job => job.job_outputs && job.job_outputs.length > 0) || [];
    },
  });
}
