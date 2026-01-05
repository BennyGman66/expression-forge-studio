import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ProductionProject, ProjectLook, ProductionProjectStatus } from "@/types/production-projects";
import { toast } from "sonner";

// Fetch all production projects with stats
export function useProductionProjects() {
  return useQuery({
    queryKey: ["production-projects"],
    queryFn: async () => {
      // Get projects with brand info
      const { data: projects, error } = await supabase
        .from("production_projects")
        .select(`
          *,
          brand:brands(id, name),
          created_by:users!production_projects_created_by_user_id_fkey(id, display_name, email)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Get look counts per project
      const { data: lookCounts } = await supabase
        .from("project_looks")
        .select("project_id");

      // Get job stats per project
      const { data: jobStats } = await supabase
        .from("unified_jobs")
        .select("project_id, status")
        .not("project_id", "is", null);

      // Count looks and jobs per project
      const lookCountMap = new Map<string, number>();
      lookCounts?.forEach(l => {
        lookCountMap.set(l.project_id, (lookCountMap.get(l.project_id) || 0) + 1);
      });

      const jobStatsMap = new Map<string, { 
        total: number; 
        open: number; 
        in_progress: number; 
        needs_changes: number; 
        approved: number;
      }>();
      
      jobStats?.forEach(j => {
        if (!j.project_id) return;
        const current = jobStatsMap.get(j.project_id) || { total: 0, open: 0, in_progress: 0, needs_changes: 0, approved: 0 };
        current.total++;
        if (j.status === 'OPEN' || j.status === 'ASSIGNED') current.open++;
        if (j.status === 'IN_PROGRESS' || j.status === 'SUBMITTED') current.in_progress++;
        if (j.status === 'NEEDS_CHANGES') current.needs_changes++;
        if (j.status === 'APPROVED' || j.status === 'CLOSED') current.approved++;
        jobStatsMap.set(j.project_id, current);
      });

      return (projects || []).map(p => ({
        ...p,
        looks_count: lookCountMap.get(p.id) || 0,
        jobs_count: jobStatsMap.get(p.id)?.total || 0,
        open_jobs_count: jobStatsMap.get(p.id)?.open || 0,
        in_progress_jobs_count: jobStatsMap.get(p.id)?.in_progress || 0,
        needs_changes_jobs_count: jobStatsMap.get(p.id)?.needs_changes || 0,
        approved_jobs_count: jobStatsMap.get(p.id)?.approved || 0,
        approved_looks_count: jobStatsMap.get(p.id)?.approved || 0, // Same as approved jobs for now
      })) as ProductionProject[];
    },
  });
}

// Fetch single production project with details
export function useProductionProject(projectId: string | null) {
  return useQuery({
    queryKey: ["production-project", projectId],
    queryFn: async () => {
      if (!projectId) return null;

      const { data, error } = await supabase
        .from("production_projects")
        .select(`
          *,
          brand:brands(id, name),
          created_by:users!production_projects_created_by_user_id_fkey(id, display_name, email)
        `)
        .eq("id", projectId)
        .single();

      if (error) throw error;
      return data as ProductionProject;
    },
    enabled: !!projectId,
  });
}

// Fetch looks for a project
export function useProjectLooks(projectId: string | null) {
  return useQuery({
    queryKey: ["project-looks", projectId],
    queryFn: async () => {
      if (!projectId) return [];

      const { data: looks, error } = await supabase
        .from("project_looks")
        .select(`
          *,
          selected_talent:digital_talents(id, name, front_face_url)
        `)
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Get job status for each look
      const lookIds = looks?.map(l => l.id) || [];
      if (lookIds.length === 0) return looks as ProjectLook[];

      const { data: jobs } = await supabase
        .from("unified_jobs")
        .select("id, look_id, status")
        .in("look_id", lookIds);

      const jobMap = new Map(jobs?.map(j => [j.look_id, { id: j.id, status: j.status }]) || []);

      return (looks || []).map(l => ({
        ...l,
        job_id: jobMap.get(l.id)?.id,
        job_status: jobMap.get(l.id)?.status,
      })) as ProjectLook[];
    },
    enabled: !!projectId,
  });
}

// Fetch approved looks for a project (for Repose)
export function useApprovedProjectLooks(projectId: string | null) {
  return useQuery({
    queryKey: ["approved-project-looks", projectId],
    queryFn: async () => {
      if (!projectId) return [];

      // Get looks with approved jobs
      const { data: jobs, error: jobsError } = await supabase
        .from("unified_jobs")
        .select(`
          id,
          look_id,
          status,
          job_outputs(id, file_url, label)
        `)
        .eq("project_id", projectId)
        .in("status", ["APPROVED", "CLOSED"]);

      if (jobsError) throw jobsError;

      const lookIds = jobs?.map(j => j.look_id).filter(Boolean) || [];
      if (lookIds.length === 0) return [];

      const { data: looks, error } = await supabase
        .from("project_looks")
        .select(`
          *,
          selected_talent:digital_talents(id, name, front_face_url)
        `)
        .in("id", lookIds);

      if (error) throw error;

      // Map jobs to looks
      const jobMap = new Map(jobs?.map(j => [j.look_id, j]) || []);

      return (looks || []).map(l => ({
        ...l,
        job_id: jobMap.get(l.id)?.id,
        job_outputs: jobMap.get(l.id)?.job_outputs,
      }));
    },
    enabled: !!projectId,
  });
}

// Create production project
export function useCreateProductionProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { name: string; brand_id?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("production_projects")
        .insert({
          name: params.name,
          brand_id: params.brand_id || null,
          created_by_user_id: user?.id || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-projects"] });
      toast.success("Production project created");
    },
    onError: (error) => {
      toast.error(`Failed to create project: ${error.message}`);
    },
  });
}

// Update production project
export function useUpdateProductionProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, updates }: { 
      projectId: string; 
      updates: { name?: string; brand_id?: string; status?: ProductionProjectStatus } 
    }) => {
      const { data, error } = await supabase
        .from("production_projects")
        .update(updates)
        .eq("id", projectId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ["production-projects"] });
      queryClient.invalidateQueries({ queryKey: ["production-project", projectId] });
    },
    onError: (error) => {
      toast.error(`Failed to update project: ${error.message}`);
    },
  });
}

// Create project look
export function useCreateProjectLook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      project_id: string;
      look_name: string;
      sku_code?: string;
      source_files_json?: Record<string, string>;
      selected_talent_id?: string;
    }) => {
      const { data, error } = await supabase
        .from("project_looks")
        .insert({
          project_id: params.project_id,
          look_name: params.look_name,
          sku_code: params.sku_code || null,
          source_files_json: params.source_files_json || {},
          selected_talent_id: params.selected_talent_id || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { project_id }) => {
      queryClient.invalidateQueries({ queryKey: ["project-looks", project_id] });
      queryClient.invalidateQueries({ queryKey: ["production-projects"] });
    },
    onError: (error) => {
      toast.error(`Failed to create look: ${error.message}`);
    },
  });
}

// Batch create project looks
export function useBatchCreateProjectLooks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      project_id: string;
      looks: Array<{
        look_name: string;
        sku_code?: string;
        source_files_json?: Record<string, string>;
        selected_talent_id?: string;
      }>;
    }) => {
      const looksToInsert = params.looks.map(l => ({
        project_id: params.project_id,
        look_name: l.look_name,
        sku_code: l.sku_code || null,
        source_files_json: l.source_files_json || {},
        selected_talent_id: l.selected_talent_id || null,
      }));

      const { data, error } = await supabase
        .from("project_looks")
        .insert(looksToInsert)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { project_id }) => {
      queryClient.invalidateQueries({ queryKey: ["project-looks", project_id] });
      queryClient.invalidateQueries({ queryKey: ["production-projects"] });
      toast.success("Looks added to project");
    },
    onError: (error) => {
      toast.error(`Failed to create looks: ${error.message}`);
    },
  });
}

// Projects eligible for repose (have at least one approved look)
export function useProjectsEligibleForRepose() {
  return useQuery({
    queryKey: ["projects-eligible-for-repose"],
    queryFn: async () => {
      // Get projects that have approved jobs
      const { data: jobs } = await supabase
        .from("unified_jobs")
        .select("project_id")
        .in("status", ["APPROVED", "CLOSED"])
        .not("project_id", "is", null);

      const projectIds = [...new Set(jobs?.map(j => j.project_id).filter(Boolean))] as string[];
      
      if (projectIds.length === 0) return [];

      const { data: projects, error } = await supabase
        .from("production_projects")
        .select(`
          *,
          brand:brands(id, name)
        `)
        .in("id", projectIds)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      // Get approved job counts per project
      const { data: jobCounts } = await supabase
        .from("unified_jobs")
        .select("project_id, status")
        .in("project_id", projectIds);

      const statsMap = new Map<string, { total: number; approved: number }>();
      jobCounts?.forEach(j => {
        if (!j.project_id) return;
        const current = statsMap.get(j.project_id) || { total: 0, approved: 0 };
        current.total++;
        if (j.status === 'APPROVED' || j.status === 'CLOSED') current.approved++;
        statsMap.set(j.project_id, current);
      });

      return (projects || []).map(p => ({
        ...p,
        jobs_count: statsMap.get(p.id)?.total || 0,
        approved_looks_count: statsMap.get(p.id)?.approved || 0,
      })) as ProductionProject[];
    },
  });
}
