import { MoreVertical, Trash2 } from "lucide-react";
import { format } from "date-fns";
import type { Project } from "@/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ProjectsGridProps {
  projects: Project[];
  onSelect: (project: Project) => void;
  onDelete: (id: string) => void;
}

export function ProjectsGrid({ projects, onSelect, onDelete }: ProjectsGridProps) {
  if (projects.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">No campaigns yet. Create your first one!</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
      {projects.map((project) => (
        <div 
          key={project.id} 
          className="project-card"
          onClick={() => onSelect(project)}
        >
          {/* Image preview area */}
          <div className="project-card-images">
            <div className="project-card-image col-span-1 row-span-2" />
            <div className="project-card-image" />
            <div className="project-card-image" />
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
      ))}
    </div>
  );
}
