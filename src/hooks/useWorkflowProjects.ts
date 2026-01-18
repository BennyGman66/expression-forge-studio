import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { 
  WorkflowProject, 
  WorkflowProjectWithStats, 
  WorkflowStage,
  WORKFLOW_STAGES 
} from '@/types/optimised-workflow';
import { useToast } from '@/hooks/use-toast';

export function useWorkflowProjects() {
  const { toast } = useToast();

  return useQuery({
    queryKey: ['workflow-projects'],
    queryFn: async (): Promise<WorkflowProjectWithStats[]> => {
      // Fetch projects
      const { data: projects, error: projectsError } = await supabase
        .from('workflow_projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (projectsError) throw projectsError;
      if (!projects || projects.length === 0) return [];

      // Fetch look counts per project
      const projectIds = projects.map(p => p.id);
      const { data: looks, error: looksError } = await supabase
        .from('workflow_looks')
        .select('id, project_id, stage')
        .in('project_id', projectIds);

      if (looksError) throw looksError;

      // Calculate stats per project
      return projects.map(project => {
        const projectLooks = (looks || []).filter(l => l.project_id === project.id);
        
        const stageBreakdown = WORKFLOW_STAGES.reduce((acc, stage) => {
          acc[stage] = projectLooks.filter(l => l.stage === stage).length;
          return acc;
        }, {} as Record<WorkflowStage, number>);

        const completedCount = projectLooks.filter(l => l.stage === 'DONE').length;
        const needsActionCount = projectLooks.filter(l => l.stage !== 'DONE').length;

        return {
          ...project,
          totalLooks: projectLooks.length,
          needsActionCount,
          completedCount,
          stageBreakdown,
        };
      });
    },
  });
}

export function useWorkflowProject(projectId: string | null) {
  return useQuery({
    queryKey: ['workflow-project', projectId],
    queryFn: async (): Promise<WorkflowProjectWithStats | null> => {
      if (!projectId) return null;

      const { data: project, error: projectError } = await supabase
        .from('workflow_projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (projectError) throw projectError;
      if (!project) return null;

      // Fetch look counts
      const { data: looks, error: looksError } = await supabase
        .from('workflow_looks')
        .select('id, stage')
        .eq('project_id', projectId);

      if (looksError) throw looksError;

      const stageBreakdown = WORKFLOW_STAGES.reduce((acc, stage) => {
        acc[stage] = (looks || []).filter(l => l.stage === stage).length;
        return acc;
      }, {} as Record<WorkflowStage, number>);

      const completedCount = (looks || []).filter(l => l.stage === 'DONE').length;
      const needsActionCount = (looks || []).filter(l => l.stage !== 'DONE').length;

      return {
        ...project,
        totalLooks: (looks || []).length,
        needsActionCount,
        completedCount,
        stageBreakdown,
      };
    },
    enabled: !!projectId,
  });
}

export function useCreateWorkflowProject() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (name: string): Promise<WorkflowProject> => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('workflow_projects')
        .insert({ name, created_by: user?.id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-projects'] });
      toast({
        title: 'Project created',
        description: 'Your new workflow project is ready.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error creating project',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateWorkflowProject() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { data, error } = await supabase
        .from('workflow_projects')
        .update({ name })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['workflow-projects'] });
      queryClient.invalidateQueries({ queryKey: ['workflow-project', data.id] });
    },
    onError: (error) => {
      toast({
        title: 'Error updating project',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteWorkflowProject() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (projectId: string) => {
      const { error } = await supabase
        .from('workflow_projects')
        .delete()
        .eq('id', projectId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-projects'] });
      toast({
        title: 'Project deleted',
        description: 'The project and all its looks have been deleted.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error deleting project',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
