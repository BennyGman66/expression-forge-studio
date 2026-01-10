import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UnifiedJob, JobStatus, JobType } from "@/types/jobs";
import { toast } from "sonner";

interface JobFilters {
  status?: JobStatus;
  type?: JobType;
  assignedUserId?: string;
  projectId?: string;
}

export function useJobs(filters?: JobFilters) {
  return useQuery({
    queryKey: ["unified-jobs", filters],
    queryFn: async () => {
      let query = supabase
        .from("unified_jobs")
        .select(`
          *,
          assigned_user:users!unified_jobs_assigned_user_id_fkey(id, display_name, email),
          created_by_user:users!unified_jobs_created_by_fkey(id, display_name, email)
        `)
        .order("created_at", { ascending: false });

      if (filters?.status) {
        query = query.eq("status", filters.status);
      }
      if (filters?.type) {
        query = query.eq("type", filters.type);
      }
      if (filters?.assignedUserId) {
        query = query.eq("assigned_user_id", filters.assignedUserId);
      }
      if (filters?.projectId) {
        query = query.eq("project_id", filters.projectId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as UnifiedJob[];
    },
  });
}

export function useJob(jobId: string | null) {
  return useQuery({
    queryKey: ["unified-job", jobId],
    queryFn: async () => {
      if (!jobId) return null;
      
      const { data, error } = await supabase
        .from("unified_jobs")
        .select(`
          *,
          assigned_user:users!unified_jobs_assigned_user_id_fkey(id, display_name, email),
          created_by_user:users!unified_jobs_created_by_fkey(id, display_name, email)
        `)
        .eq("id", jobId)
        .single();

      if (error) throw error;
      return data as UnifiedJob;
    },
    enabled: !!jobId,
  });
}

export function useJobInputs(jobId: string | null) {
  return useQuery({
    queryKey: ["job-inputs", jobId],
    queryFn: async () => {
      if (!jobId) return [];
      
      const { data, error } = await supabase
        .from("job_inputs")
        .select(`
          *,
          artifact:unified_artifacts(*)
        `)
        .eq("job_id", jobId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!jobId,
  });
}

export function useJobOutputs(jobId: string | null) {
  return useQuery({
    queryKey: ["job-outputs", jobId],
    queryFn: async () => {
      if (!jobId) return [];
      
      const { data, error } = await supabase
        .from("job_outputs")
        .select(`
          *,
          artifact:unified_artifacts(*),
          uploader:users!job_outputs_uploaded_by_fkey(id, display_name, email)
        `)
        .eq("job_id", jobId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!jobId,
  });
}

export function useJobNotes(jobId: string | null) {
  return useQuery({
    queryKey: ["job-notes", jobId],
    queryFn: async () => {
      if (!jobId) return [];
      
      const { data, error } = await supabase
        .from("job_notes")
        .select(`
          *,
          author:users!job_notes_author_id_fkey(id, display_name, email)
        `)
        .eq("job_id", jobId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!jobId,
  });
}

export function useCreateJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (job: {
      project_id?: string;
      look_id?: string;
      type: JobType;
      instructions?: string;
      due_date?: string;
      assigned_user_id?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("unified_jobs")
        .insert({
          ...job,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unified-jobs"] });
      toast.success("Job created successfully");
    },
    onError: (error) => {
      toast.error(`Failed to create job: ${error.message}`);
    },
  });
}

export function useUpdateJobStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ jobId, status, assignedUserId }: { jobId: string; status: JobStatus; assignedUserId?: string }) => {
      const updateData: { status: JobStatus; assigned_user_id?: string } = { status };
      
      // If starting a job (IN_PROGRESS) and assignedUserId is provided, set it
      if (assignedUserId !== undefined) {
        updateData.assigned_user_id = assignedUserId;
      }
      
      const { data, error } = await supabase
        .from("unified_jobs")
        .update(updateData)
        .eq("id", jobId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { jobId }) => {
      queryClient.invalidateQueries({ queryKey: ["unified-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["unified-job", jobId] });
      toast.success("Job status updated");
    },
    onError: (error) => {
      toast.error(`Failed to update status: ${error.message}`);
    },
  });
}

export function useAssignJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ jobId, userId }: { jobId: string; userId: string | null }) => {
      const { data, error } = await supabase
        .from("unified_jobs")
        .update({ 
          assigned_user_id: userId,
          status: userId ? 'ASSIGNED' : 'OPEN'
        })
        .eq("id", jobId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { jobId }) => {
      queryClient.invalidateQueries({ queryKey: ["unified-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["unified-job", jobId] });
      toast.success("Job assigned successfully");
    },
    onError: (error) => {
      toast.error(`Failed to assign job: ${error.message}`);
    },
  });
}

export function useAddJobNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ jobId, body }: { jobId: string; body: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("job_notes")
        .insert({
          job_id: jobId,
          author_id: user.id,
          body,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { jobId }) => {
      queryClient.invalidateQueries({ queryKey: ["job-notes", jobId] });
    },
    onError: (error) => {
      toast.error(`Failed to add note: ${error.message}`);
    },
  });
}

export function useDeleteJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (jobId: string) => {
      // Delete related data first (cascade)
      await supabase.from("job_outputs").delete().eq("job_id", jobId);
      await supabase.from("job_inputs").delete().eq("job_id", jobId);
      await supabase.from("job_notes").delete().eq("job_id", jobId);
      await supabase.from("job_submissions").delete().eq("job_id", jobId);

      // Delete the job
      const { error } = await supabase
        .from("unified_jobs")
        .delete()
        .eq("id", jobId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unified-jobs"] });
      toast.success("Job deleted");
    },
    onError: (error) => {
      toast.error(`Failed to delete job: ${error.message}`);
    },
  });
}

// Hook for freelancer dashboard: fetches claimable open jobs + user's assigned jobs
export function useFreelancerJobs(userId: string | undefined) {
  return useQuery({
    queryKey: ["freelancer-jobs", userId],
    queryFn: async () => {
      if (!userId) return { assignedJobs: [], claimableJobs: [] };

      // Get jobs assigned to this user (any status)
      const { data: assignedJobs, error: assignedError } = await supabase
        .from("unified_jobs")
        .select(`
          *,
          assigned_user:users!unified_jobs_assigned_user_id_fkey(id, display_name, email),
          created_by_user:users!unified_jobs_created_by_fkey(id, display_name, email)
        `)
        .eq("assigned_user_id", userId)
        .order("created_at", { ascending: false });

      if (assignedError) throw assignedError;

      // Get all OPEN jobs without assignment (claimable by any freelancer)
      const { data: claimableJobs, error: claimableError } = await supabase
        .from("unified_jobs")
        .select(`
          *,
          assigned_user:users!unified_jobs_assigned_user_id_fkey(id, display_name, email),
          created_by_user:users!unified_jobs_created_by_fkey(id, display_name, email)
        `)
        .eq("status", "OPEN")
        .is("assigned_user_id", null)
        .order("priority", { ascending: true })
        .order("created_at", { ascending: false });

      if (claimableError) throw claimableError;

      return {
        assignedJobs: (assignedJobs || []) as UnifiedJob[],
        claimableJobs: (claimableJobs || []) as UnifiedJob[],
      };
    },
    enabled: !!userId,
  });
}
