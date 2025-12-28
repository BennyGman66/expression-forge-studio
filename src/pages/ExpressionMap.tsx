import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { HubHeader } from "@/components/layout/HubHeader";
import { ProjectsGrid } from "@/components/expression-map/ProjectsGrid";
import { ProjectWorkspace } from "@/components/expression-map/ProjectWorkspace";
import { CreateProjectDialog } from "@/components/expression-map/CreateProjectDialog";
import { useProjects, useProjectData } from "@/hooks/useProject";
import type { Project } from "@/types";
import { Plus } from "lucide-react";

export default function ExpressionMap() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  
  const { projects, createProject, deleteProject } = useProjects();
  const [currentProject, setCurrentProject] = useState<Project | null>(null);

  // Find current project from URL param
  useEffect(() => {
    if (projectId) {
      const project = projects.find(p => p.id === projectId);
      if (project) {
        setCurrentProject(project);
      }
    } else {
      setCurrentProject(null);
    }
  }, [projectId, projects]);

  const handleSelectProject = (project: Project) => {
    navigate(`/expression-map/${project.id}`);
  };

  const handleCreateProject = async (name: string, masterPrompt: string) => {
    const project = await createProject(name, masterPrompt);
    if (project) {
      setShowCreateDialog(false);
      navigate(`/expression-map/${project.id}`);
    }
  };

  const handleDeleteProject = async (id: string) => {
    await deleteProject(id);
    if (currentProject?.id === id) {
      navigate('/expression-map');
    }
  };

  const handleBackToProjects = () => {
    navigate('/expression-map');
  };

  // Show project workspace if we have a project selected
  if (currentProject) {
    return (
      <ProjectWorkspace 
        project={currentProject} 
        onBack={handleBackToProjects}
        onDelete={() => handleDeleteProject(currentProject.id)}
      />
    );
  }

  // Show all campaigns/projects
  return (
    <div className="min-h-screen bg-background">
      <HubHeader currentApp="Expression Map" />

      <main className="px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-serif">All Campaigns</h1>
          <button 
            onClick={() => setShowCreateDialog(true)}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" />
            Create new expression map
          </button>
        </div>

        <ProjectsGrid 
          projects={projects}
          onSelect={handleSelectProject}
          onDelete={handleDeleteProject}
        />
      </main>

      <CreateProjectDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreate={handleCreateProject}
      />
    </div>
  );
}
