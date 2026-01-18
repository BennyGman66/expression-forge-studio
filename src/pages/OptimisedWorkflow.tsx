import { useParams, useNavigate } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { ProductionDashboard } from '@/components/optimised-workflow/ProductionDashboard';
import { WorkflowProjectsPage } from '@/components/optimised-workflow/WorkflowProjectsPage';
import { useWorkflowProjects, useCreateWorkflowProject, useDeleteWorkflowProject } from '@/hooks/useWorkflowProjects';

export default function OptimisedWorkflow() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  
  const { data: projects, isLoading: projectsLoading } = useWorkflowProjects();
  const createProject = useCreateWorkflowProject();
  const deleteProject = useDeleteWorkflowProject();

  const handleSelectProject = (id: string) => {
    navigate(`/optimised-workflow/${id}`);
  };

  const handleCreateProject = async (name: string) => {
    const project = await createProject.mutateAsync(name);
    navigate(`/optimised-workflow/${project.id}`);
  };

  const handleDeleteProject = async (id: string) => {
    await deleteProject.mutateAsync(id);
  };

  const handleBack = () => {
    navigate('/optimised-workflow');
  };

  // If we have a projectId, show the dashboard
  if (projectId) {
    return (
      <div className="min-h-screen bg-background">
        <Header title="Optimised Workflow" />
        <ProductionDashboard 
          projectId={projectId} 
          onBack={handleBack}
        />
      </div>
    );
  }

  // Otherwise show the projects page
  return (
    <div className="min-h-screen bg-background">
      <Header title="Optimised Workflow" />
      <WorkflowProjectsPage
        projects={projects || []}
        isLoading={projectsLoading}
        onSelect={handleSelectProject}
        onCreate={handleCreateProject}
        onDelete={handleDeleteProject}
        isCreating={createProject.isPending}
      />
    </div>
  );
}
