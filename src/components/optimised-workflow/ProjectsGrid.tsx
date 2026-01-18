import { useState } from 'react';
import { Plus, MoreVertical, Trash2, FolderOpen, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { WorkflowProjectWithStats, STAGE_CONFIG } from '@/types/optimised-workflow';
import { format } from 'date-fns';

interface ProjectsGridProps {
  projects: WorkflowProjectWithStats[];
  isLoading: boolean;
  onSelect: (projectId: string) => void;
  onCreate: (name: string) => Promise<void>;
  onDelete: (projectId: string) => Promise<void>;
  isCreating: boolean;
}

export function ProjectsGrid({
  projects,
  isLoading,
  onSelect,
  onCreate,
  onDelete,
  isCreating,
}: ProjectsGridProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await onCreate(newName.trim());
    setNewName('');
    setShowCreateDialog(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {/* Create New Project Card */}
        <Card 
          className="border-dashed border-2 hover:border-primary/50 cursor-pointer transition-colors"
          onClick={() => setShowCreateDialog(true)}
        >
          <CardContent className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Plus className="h-10 w-10 mb-2" />
            <span className="font-medium">New Project</span>
          </CardContent>
        </Card>

        {/* Project Cards */}
        {projects.map((project) => (
          <Card 
            key={project.id} 
            className="hover:shadow-md transition-shadow cursor-pointer group"
            onClick={() => onSelect(project.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-primary" />
                  <h3 className="font-medium text-foreground truncate max-w-[180px]">
                    {project.name}
                  </h3>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem 
                      className="text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(project.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="text-sm text-muted-foreground mb-3">
                Created {format(new Date(project.created_at), 'MMM d, yyyy')}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 text-center border-t pt-3">
                <div>
                  <div className="text-lg font-semibold text-foreground">
                    {project.totalLooks}
                  </div>
                  <div className="text-xs text-muted-foreground">Looks</div>
                </div>
                <div>
                  <div className="text-lg font-semibold text-amber-600">
                    {project.needsActionCount}
                  </div>
                  <div className="text-xs text-muted-foreground">In Progress</div>
                </div>
                <div>
                  <div className="text-lg font-semibold text-emerald-600">
                    {project.completedCount}
                  </div>
                  <div className="text-xs text-muted-foreground">Complete</div>
                </div>
              </div>

              {/* Stage breakdown mini-bar */}
              {project.totalLooks > 0 && (
                <div className="mt-3 h-2 rounded-full overflow-hidden flex bg-muted">
                  {Object.entries(project.stageBreakdown).map(([stage, count]) => {
                    if (count === 0) return null;
                    const config = STAGE_CONFIG[stage as keyof typeof STAGE_CONFIG];
                    const width = (count / project.totalLooks) * 100;
                    return (
                      <div
                        key={stage}
                        className={config.bgColor}
                        style={{ width: `${width}%` }}
                        title={`${config.label}: ${count}`}
                      />
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {projects.length === 0 && (
        <div className="text-center py-12">
          <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No projects yet</h3>
          <p className="text-muted-foreground mb-4">
            Create your first project to get started with the optimised workflow.
          </p>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Project
          </Button>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Project name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreate} 
              disabled={!newName.trim() || isCreating}
            >
              {isCreating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
