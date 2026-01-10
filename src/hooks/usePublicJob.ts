import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { UnifiedJob } from '@/types/jobs';

export function usePublicJob(accessToken: string | undefined) {
  return useQuery({
    queryKey: ['public-job', accessToken],
    queryFn: async () => {
      if (!accessToken) return null;

      const { data, error } = await supabase
        .from('unified_jobs')
        .select(`
          *,
          assigned_user:users!unified_jobs_assigned_user_id_fkey(id, display_name, email),
          created_by_user:users!unified_jobs_created_by_fkey(id, display_name, email)
        `)
        .eq('access_token', accessToken)
        .maybeSingle();

      if (error) throw error;
      return data as UnifiedJob | null;
    },
    enabled: !!accessToken,
    retry: false,
  });
}

// New hook: Fetch job by ID (for /work/:jobId route)
export function usePublicJobById(jobId: string | undefined) {
  return useQuery({
    queryKey: ['public-job-by-id', jobId],
    queryFn: async () => {
      if (!jobId) return null;

      const { data, error } = await supabase
        .from('unified_jobs')
        .select(`
          *,
          assigned_user:users!unified_jobs_assigned_user_id_fkey(id, display_name, email),
          created_by_user:users!unified_jobs_created_by_fkey(id, display_name, email)
        `)
        .eq('id', jobId)
        .maybeSingle();

      if (error) throw error;
      return data as UnifiedJob | null;
    },
    enabled: !!jobId,
    retry: false,
  });
}

// New hook: Fetch all jobs for public freelancer board
export function usePublicFreelancerJobs(freelancerIdentityId: string | undefined) {
  return useQuery({
    queryKey: ['public-freelancer-jobs', freelancerIdentityId],
    queryFn: async () => {
      // Fetch open jobs (claimable) and jobs assigned to this freelancer
      const { data, error } = await supabase
        .from('unified_jobs')
        .select('*')
        .or(`and(status.eq.OPEN,freelancer_identity_id.is.null),freelancer_identity_id.eq.${freelancerIdentityId}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!freelancerIdentityId,
  });
}

export function usePublicJobInputs(jobId: string | undefined) {
  return useQuery({
    queryKey: ['public-job-inputs', jobId],
    queryFn: async () => {
      if (!jobId) return [];

      const { data, error } = await supabase
        .from('job_inputs')
        .select(`
          *,
          artifact:unified_artifacts(*)
        `)
        .eq('job_id', jobId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!jobId,
  });
}

export function usePublicJobOutputs(jobId: string | undefined) {
  return useQuery({
    queryKey: ['public-job-outputs', jobId],
    queryFn: async () => {
      if (!jobId) return [];

      const { data, error } = await supabase
        .from('job_outputs')
        .select(`
          *,
          artifact:unified_artifacts(*)
        `)
        .eq('job_id', jobId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!jobId,
  });
}

export function usePublicJobNotes(jobId: string | undefined) {
  return useQuery({
    queryKey: ['public-job-notes', jobId],
    queryFn: async () => {
      if (!jobId) return [];

      const { data, error } = await supabase
        .from('job_notes')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!jobId,
  });
}

export function usePublicLatestSubmission(jobId: string | undefined) {
  return useQuery({
    queryKey: ['public-latest-submission', jobId],
    queryFn: async () => {
      if (!jobId) return null;

      const { data, error } = await supabase
        .from('job_submissions')
        .select('*')
        .eq('job_id', jobId)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!jobId,
  });
}
