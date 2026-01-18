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

interface WorkflowProjectsPageProps {
  projects: WorkflowProjectWithStats[];
  isLoading: boolean;
  onSelect: (projectId: string) => void;
  onCreate: (name: string) => Promise<void>;
  onDelete: (projectId: string) => Promise<void>;
  isCreating: boolean;
}

export function WorkflowProjectsPage({
  projects,
  isLoading,
  onSelect,
  onCreate,
  onDelete,
  isCreating,
}: WorkflowProjectsPageProps) {
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
      <div className="container mx-auto px-6 py-8 max-w-6xl">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              Projects
            </h1>
            <p className="text-muted-foreground mt-1">
              Select a project or create a new one to get started
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Project
          </Button>
        </div>

        {/* Projects Grid or Empty State */}
        {projects.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <FolderOpen className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">No projects yet</h3>
              <p className="text-muted-foreground mb-6 max-w-sm">
                Create your first project to start the optimised workflow. 
                Upload looks, pair models, and track progress through each stage.
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Project
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <Card 
                key={project.id} 
                className="hover:shadow-md transition-shadow cursor-pointer group"
                onClick={() => onSelect(project.id)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <FolderOpen className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium text-foreground truncate max-w-[180px]">
                          {project.name}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(project.created_at), 'MMM d, yyyy')}
                        </p>
                      </div>
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

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3 text-center border-t pt-4 mt-4">
                    <div>
                      <div className="text-xl font-semibold text-foreground">
                        {project.totalLooks}
                      </div>
                      <div className="text-xs text-muted-foreground">Looks</div>
                    </div>
                    <div>
                      <div className="text-xl font-semibold text-amber-600">
                        {project.needsActionCount}
                      </div>
                      <div className="text-xs text-muted-foreground">Active</div>
                    </div>
                    <div>
                      <div className="text-xl font-semibold text-emerald-600">
                        {project.completedCount}
                      </div>
                      <div className="text-xs text-muted-foreground">Done</div>
                    </div>
                  </div>

                  {/* Stage breakdown mini-bar */}
                  {project.totalLooks > 0 && (
                    <div className="mt-4 h-1.5 rounded-full overflow-hidden flex bg-muted">
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
        )}
      </div>

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
