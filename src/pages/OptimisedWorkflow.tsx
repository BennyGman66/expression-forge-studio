import { useParams, useNavigate } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { ProjectsGrid } from '@/components/optimised-workflow/ProjectsGrid';
import { ProductionDashboard } from '@/components/optimised-workflow/ProductionDashboard';
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

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {projectId ? (
        <ProductionDashboard 
          projectId={projectId} 
          onBack={handleBack}
        />
      ) : (
        <div className="container mx-auto px-6 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-semibold text-foreground">
              Optimised Workflow
            </h1>
            <p className="text-muted-foreground mt-2">
              Unified single-page production dashboard with stage tracking
            </p>
          </div>

          <ProjectsGrid
            projects={projects || []}
            isLoading={projectsLoading}
            onSelect={handleSelectProject}
            onCreate={handleCreateProject}
            onDelete={handleDeleteProject}
            isCreating={createProject.isPending}
          />
        </div>
      )}
    </div>
  );
}
