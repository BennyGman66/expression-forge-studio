import { MoreVertical, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import type { Project } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ProjectThumbnails {
  brandRefs: string[];
  modelRefs: string[];
}

interface ProjectsGridProps {
  projects: Project[];
  onSelect: (project: Project) => void;
  onDelete: (id: string) => void;
}

function ThumbnailGrid({ images, emptyCount = 4 }: { images: string[]; emptyCount?: number }) {
  // Always show a 2x2 grid - fill with empty placeholders if needed
  const slots = [...images.slice(0, emptyCount)];
  while (slots.length < emptyCount) {
    slots.push('');
  }

  return (
    <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-1 h-full">
      {slots.map((url, idx) => (
        <div 
          key={idx}
          className="aspect-square bg-secondary/50 rounded-sm overflow-hidden"
        >
          {url && (
            <img 
              src={url} 
              alt="" 
              className="w-full h-full object-cover"
            />
          )}
        </div>
      ))}
    </div>
  );
}

export function ProjectsGrid({ projects, onSelect, onDelete }: ProjectsGridProps) {
  const [thumbnails, setThumbnails] = useState<Record<string, ProjectThumbnails>>({});

  useEffect(() => {
    const fetchThumbnails = async () => {
      if (projects.length === 0) return;

      const projectIds = projects.map(p => p.id);

      // Fetch brand refs for all projects
      const { data: brandRefs } = await supabase
        .from('brand_refs')
        .select('project_id, image_url')
        .in('project_id', projectIds)
        .order('created_at', { ascending: true });

      // Fetch digital models for all projects
      const { data: models } = await supabase
        .from('digital_models')
        .select('id, project_id')
        .in('project_id', projectIds);

      // Fetch model refs if there are models
      let modelRefsData: { digital_model_id: string; image_url: string }[] = [];
      if (models && models.length > 0) {
        const { data } = await supabase
          .from('digital_model_refs')
          .select('digital_model_id, image_url')
          .in('digital_model_id', models.map(m => m.id))
          .order('created_at', { ascending: true });
        modelRefsData = data || [];
      }

      // Group by project
      const result: Record<string, ProjectThumbnails> = {};
      
      projectIds.forEach(id => {
        result[id] = { brandRefs: [], modelRefs: [] };
      });

      // Add brand refs (limit to 4)
      (brandRefs || []).forEach(ref => {
        if (result[ref.project_id] && result[ref.project_id].brandRefs.length < 4) {
          result[ref.project_id].brandRefs.push(ref.image_url);
        }
      });

      // Map model refs to projects (limit to 4)
      const modelToProject: Record<string, string> = {};
      (models || []).forEach(m => {
        modelToProject[m.id] = m.project_id;
      });

      modelRefsData.forEach(ref => {
        const projectId = modelToProject[ref.digital_model_id];
        if (projectId && result[projectId] && result[projectId].modelRefs.length < 4) {
          result[projectId].modelRefs.push(ref.image_url);
        }
      });

      setThumbnails(result);
    };

    fetchThumbnails();
  }, [projects]);

  if (projects.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">No campaigns yet. Create your first one!</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {projects.map((project) => {
        const projectThumbs = thumbnails[project.id] || { brandRefs: [], modelRefs: [] };
        
        return (
          <div 
            key={project.id} 
            className="project-card"
            onClick={() => onSelect(project)}
          >
            {/* Image preview area - fixed height with left/right split */}
            <div className="h-48 bg-muted p-2 flex gap-2">
              <ThumbnailGrid images={projectThumbs.brandRefs} />
              <div className="w-px bg-border/30 shrink-0" />
              <ThumbnailGrid images={projectThumbs.modelRefs} />
            </div>
            
            {/* Footer */}
            <div className="project-card-footer">
              <div>
                <h3 className="font-medium text-foreground">{project.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(project.created_at), 'MMM d, yyyy')}
                </p>
              </div>
              
              <DropdownMenu>
                <DropdownMenuTrigger 
                  onClick={(e) => e.stopPropagation()}
                  className="p-1 rounded hover:bg-secondary"
                >
                  <MoreVertical className="w-4 h-4 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(project.id);
                    }}
                    className="text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        );
      })}
    </div>
  );
}
