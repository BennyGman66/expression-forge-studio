import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface FaceApplicationProject {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  look_count?: number;
  talent_count?: number;
  job_count?: number;
}

export function useFaceApplicationProjects() {
  const [projects, setProjects] = useState<FaceApplicationProject[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("face_application_projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error loading projects", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    // Get look counts, talent counts, and job counts for each project
    const projectsWithStats = await Promise.all(
      (data || []).map(async (project) => {
        const { data: looks } = await supabase
          .from("talent_looks")
          .select("id, digital_talent_id")
          .eq("project_id", project.id);

        const uniqueTalents = new Set((looks || []).map((l) => l.digital_talent_id).filter(Boolean));

        // Get job count for this project
        const { count: jobCount } = await supabase
          .from("unified_jobs")
          .select("id", { count: "exact", head: true })
          .eq("project_id", project.id);

        return {
          ...project,
          look_count: looks?.length || 0,
          talent_count: uniqueTalents.size,
          job_count: jobCount || 0,
        };
      })
    );

    setProjects(projectsWithStats);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const createProject = async (name: string, description?: string) => {
    // Get user first for production_project
    const { data: { user } } = await supabase.auth.getUser();

    // Create face_application_projects entry
    const { data, error } = await supabase
      .from("face_application_projects")
      .insert({ name, description })
      .select()
      .single();

    if (error) {
      toast({ title: "Error creating project", description: error.message, variant: "destructive" });
      return null;
    }

    // Create production_project with THE SAME ID for consistent job grouping
    await supabase
      .from("production_projects")
      .insert({ 
        id: data.id, // Use the same ID!
        name, 
        created_by_user_id: user?.id || null,
        status: 'ACTIVE'
      });

    await fetchProjects();
    return data;
  };

  const deleteProject = async (projectId: string) => {
    // First, unlink looks from the project
    await supabase
      .from("talent_looks")
      .update({ project_id: null })
      .eq("project_id", projectId);

    // Delete jobs associated with the project
    await supabase
      .from("face_application_jobs")
      .delete()
      .eq("project_id", projectId);

    const { error } = await supabase
      .from("face_application_projects")
      .delete()
      .eq("id", projectId);

    if (error) {
      toast({ title: "Error deleting project", description: error.message, variant: "destructive" });
      return false;
    }

    await fetchProjects();
    return true;
  };

  return {
    projects,
    loading,
    createProject,
    deleteProject,
    refetch: fetchProjects,
  };
}

export function useFaceApplicationProjectData(projectId: string | null) {
  const [looks, setLooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchLooks = useCallback(async () => {
    if (!projectId) {
      setLooks([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("talent_looks")
      .select(`
        *,
        digital_talents (id, name, front_face_url)
      `)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error loading looks", description: error.message, variant: "destructive" });
    }

    setLooks(data || []);
    setLoading(false);
  }, [projectId, toast]);

  useEffect(() => {
    fetchLooks();
  }, [fetchLooks]);

  const addLookToProject = async (lookId: string) => {
    const { error } = await supabase
      .from("talent_looks")
      .update({ project_id: projectId })
      .eq("id", lookId);

    if (error) {
      toast({ title: "Error adding look", description: error.message, variant: "destructive" });
      return false;
    }

    await fetchLooks();
    return true;
  };

  const removeLookFromProject = async (lookId: string) => {
    const { error } = await supabase
      .from("talent_looks")
      .update({ project_id: null })
      .eq("id", lookId);

    if (error) {
      toast({ title: "Error removing look", description: error.message, variant: "destructive" });
      return false;
    }

    await fetchLooks();
    return true;
  };

  return {
    looks,
    loading,
    addLookToProject,
    removeLookFromProject,
    refetch: fetchLooks,
  };
}
