import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  FolderPlus, 
  FolderOpen, 
  Sparkles, 
  ArrowRight,
  Trash2,
  Calendar
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Project } from "@/types";
import { DEFAULT_MASTER_PROMPT } from "@/lib/constants";
import { format } from "date-fns";

interface ProjectSelectorProps {
  projects: Project[];
  isOpen: boolean;
  onClose: () => void;
  onSelect: (project: Project) => void;
  onCreate: (name: string, masterPrompt: string) => void;
  onDelete: (id: string) => void;
}

export function ProjectSelector({ 
  projects, 
  isOpen, 
  onClose, 
  onSelect, 
  onCreate,
  onDelete 
}: ProjectSelectorProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [masterPrompt, setMasterPrompt] = useState(DEFAULT_MASTER_PROMPT);

  const handleCreate = () => {
    if (newName.trim()) {
      onCreate(newName.trim(), masterPrompt);
      setNewName('');
      setMasterPrompt(DEFAULT_MASTER_PROMPT);
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Expression Map Factory
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {!isCreating ? (
            <div className="space-y-4">
              <Button 
                variant="outline" 
                className="w-full h-20 border-dashed"
                onClick={() => setIsCreating(true)}
              >
                <FolderPlus className="w-6 h-6 mr-3" />
                Create New Project
              </Button>

              {projects.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground px-1">
                    Recent Projects
                  </h3>
                  {projects.map((project) => (
                    <div
                      key={project.id}
                      className={cn(
                        "group flex items-center gap-4 p-4 rounded-lg border border-border",
                        "hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-all"
                      )}
                      onClick={() => onSelect(project)}
                    >
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <FolderOpen className="w-6 h-6 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{project.name}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(project.created_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(project.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  ))}
                </div>
              )}

              {projects.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No projects yet. Create your first one!</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Project Name</label>
                <Input
                  placeholder="My Expression Map Project"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="mt-1.5"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="text-sm font-medium">Master Prompt Template</label>
                <p className="text-xs text-muted-foreground mt-0.5 mb-1.5">
                  This will be the base for all generated prompts. Expression recipes will be appended.
                </p>
                <Textarea
                  value={masterPrompt}
                  onChange={(e) => setMasterPrompt(e.target.value)}
                  rows={8}
                  className="font-mono text-sm"
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsCreating(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={!newName.trim()}>
                  Create Project
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
