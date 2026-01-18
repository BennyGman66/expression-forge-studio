import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  FolderOpen, 
  ArrowRight, 
  Images, 
  AlertCircle, 
  CheckCircle2, 
  ChevronLeft,
  Clock,
  CircleDashed
} from "lucide-react";
import { useProjectsEligibleForRepose, useApprovedProjectLooks, useAllProjectLooks } from "@/hooks/useProductionProjects";
import { useCreateReposeBatch, useReposeBatchByProjectId } from "@/hooks/useReposeBatches";
import { LeapfrogLoader } from "@/components/ui/LeapfrogLoader";
import { ProductionProject } from "@/types/production-projects";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ProjectSelectPanelProps {
  onBatchCreated?: (batchId: string) => void;
}

export function ProjectSelectPanel({ onBatchCreated }: ProjectSelectPanelProps) {
  const navigate = useNavigate();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedLookIds, setSelectedLookIds] = useState<Set<string>>(new Set());
  
  const { data: eligibleProjects, isLoading: projectsLoading } = useProjectsEligibleForRepose();
  const { data: approvedLooks, isLoading: looksLoading } = useApprovedProjectLooks(selectedProjectId);
  const { data: allLooks, isLoading: allLooksLoading } = useAllProjectLooks(selectedProjectId);
  const { data: existingBatch, isLoading: checkingBatch } = useReposeBatchByProjectId(selectedProjectId || undefined);
  const createBatch = useCreateReposeBatch();

  const selectedProject = eligibleProjects?.find(p => p.id === selectedProjectId);

  // Auto-select all looks when project is selected
  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedLookIds(new Set()); // Clear selection, will auto-select all when looks load
  };

  // Select all approved looks
  const handleSelectAll = () => {
    setSelectedLookIds(new Set(approvedLooks?.map(l => l.id) || []));
  };

  // Toggle look selection
  const toggleLook = (lookId: string) => {
    const newSet = new Set(selectedLookIds);
    if (newSet.has(lookId)) {
      newSet.delete(lookId);
    } else {
      newSet.add(lookId);
    }
    setSelectedLookIds(newSet);
  };

  // Back to project selection
  const handleBack = () => {
    setSelectedProjectId(null);
    setSelectedLookIds(new Set());
  };

  // Create batch from selected looks (or append to existing batch)
  const handleCreateBatch = async () => {
    if (!selectedProjectId || selectedLookIds.size === 0) return;

    // Get look_source_images for selected looks (these have clean, sanitized URLs)
    const selectedLookIdsArray = Array.from(selectedLookIds);
    const { data: sourceImages } = await supabase
      .from('look_source_images')
      .select('look_id, view, source_url')
      .in('look_id', selectedLookIdsArray);
    
    // Create a map: look_id -> view -> source_url
    const sourceImageMap = new Map<string, Map<string, string>>();
    sourceImages?.forEach(img => {
      if (!sourceImageMap.has(img.look_id)) {
        sourceImageMap.set(img.look_id, new Map());
      }
      sourceImageMap.get(img.look_id)!.set(img.view.toLowerCase(), img.source_url);
    });

    // Collect all outputs from selected looks, preferring look_source_images URLs
    const outputs: Array<{ look_id: string; view: string; source_output_id: string; source_url: string }> = [];
    
    approvedLooks?.filter(l => selectedLookIds.has(l.id)).forEach(look => {
      (look.job_outputs || []).forEach((output: any) => {
        if (output.file_url) {
          // Parse view type from label (e.g., "Front View - filename.png" -> "front")
          const labelLower = (output.label || '').toLowerCase();
          let viewType = 'unknown';
          if (labelLower.includes('front')) viewType = 'front';
          else if (labelLower.includes('back')) viewType = 'back';
          else if (labelLower.includes('side')) viewType = 'side';
          else if (labelLower.includes('detail')) viewType = 'detail';
          
          // Prefer clean URL from look_source_images, fallback to job_outputs.file_url
          const cleanUrl = sourceImageMap.get(look.id)?.get(viewType);
          
          outputs.push({
            look_id: look.id,
            view: output.label || 'unknown',
            source_output_id: output.id,
            source_url: cleanUrl || output.file_url,
          });
        }
      });
    });

    if (outputs.length === 0) {
      return;
    }

    // If batch already exists for this project, append new looks to it
    if (existingBatch) {
      // Get existing look IDs already in batch
      const { data: existingItems } = await supabase
        .from('repose_batch_items')
        .select('look_id')
        .eq('batch_id', existingBatch.id);
      
      const existingLookIds = new Set(existingItems?.map(i => i.look_id).filter(Boolean));
      
      // Filter to outputs from looks not already in batch
      const newOutputs = outputs.filter(o => !existingLookIds.has(o.look_id));
      
      if (newOutputs.length > 0) {
        const batchItems = newOutputs.map(output => ({
          batch_id: existingBatch.id,
          look_id: output.look_id,
          view: output.view,
          source_output_id: output.source_output_id,
          source_url: output.source_url,
        }));
        
        const { error } = await supabase.from('repose_batch_items').insert(batchItems);
        if (error) {
          toast.error(`Failed to add looks: ${error.message}`);
          return;
        }
        
        const newLookCount = new Set(newOutputs.map(o => o.look_id)).size;
        toast.success(`Added ${newLookCount} look${newLookCount > 1 ? 's' : ''} to existing batch`);
      }
      
      navigate(`/repose-production/batch/${existingBatch.id}?tab=setup`);
      return;
    }

    createBatch.mutate(
      { projectId: selectedProjectId, outputs },
      {
        onSuccess: (batch) => {
          navigate(`/repose-production/batch/${batch.id}?tab=setup`);
          onBatchCreated?.(batch.id);
        },
      }
    );
  };

  if (projectsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LeapfrogLoader />
      </div>
    );
  }

  // Look selection view
  if (selectedProjectId && selectedProject) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={handleBack}>
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FolderOpen className="w-5 h-5" />
                  {selectedProject.name}
                </CardTitle>
                <CardDescription>
                  Select which approved looks to include in the repose batch
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {looksLoading || allLooksLoading ? (
              <div className="flex items-center justify-center py-8">
                <LeapfrogLoader />
              </div>
            ) : !approvedLooks || approvedLooks.length === 0 ? (
              <div className="space-y-6">
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No approved looks available in this project yet.</p>
                </div>
                
                {/* Show pending looks */}
                {allLooks?.pending && allLooks.pending.length > 0 && (
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Pending Looks ({allLooks.pending.length})
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {allLooks.pending.map((look) => (
                        <Card key={look.id} className="cursor-not-allowed bg-muted/30 opacity-60">
                          <CardContent className="p-3">
                            <p className="font-medium text-sm truncate">{look.name}</p>
                            <Badge variant="secondary" className="mt-1 text-[10px]">
                              <CircleDashed className="w-2.5 h-2.5 mr-0.5" />
                              {look.job_status === 'IN_PROGRESS' ? 'In Progress' : 
                               look.job_status === 'SUBMITTED' ? 'Submitted' :
                               look.job_status === 'NEEDS_CHANGES' ? 'Needs Changes' : 'Open'}
                            </Badge>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                {existingBatch && (
                  <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                    <p className="text-sm text-primary">
                      A repose batch already exists for this project. Clicking proceed will open the existing batch.
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {selectedLookIds.size} of {approvedLooks.length} looks selected
                  </span>
                  <Button variant="outline" size="sm" onClick={handleSelectAll}>
                    Select All
                  </Button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-[400px] overflow-y-auto p-1">
                  {approvedLooks.map((look) => {
                    const isSelected = selectedLookIds.has(look.id);
                    const outputCount = look.job_outputs?.length || 0;
                    
                    return (
                      <Card
                        key={look.id}
                        className={cn(
                          "cursor-pointer transition-all hover:border-primary/50",
                          isSelected && "border-primary bg-primary/5"
                        )}
                        onClick={() => toggleLook(look.id)}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-start gap-2">
                            <Checkbox 
                              checked={isSelected}
                              onCheckedChange={() => toggleLook(look.id)}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">
                                {look.look_name}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="secondary" className="text-[10px] px-1">
                                  <Images className="w-2.5 h-2.5 mr-0.5" />
                                  {outputCount}
                                </Badge>
                                <Badge variant="outline" className="text-[10px] px-1 text-green-600">
                                  <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                                  Approved
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Show pending looks below the approved ones */}
                {allLooks?.pending && allLooks.pending.length > 0 && (
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Not Yet Approved ({allLooks.pending.length})
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {allLooks.pending.map((look) => (
                        <Card key={look.id} className="cursor-not-allowed bg-muted/30 opacity-60">
                          <CardContent className="p-3">
                            <p className="font-medium text-sm truncate">{look.name}</p>
                            <Badge variant="secondary" className="mt-1 text-[10px]">
                              <CircleDashed className="w-2.5 h-2.5 mr-0.5" />
                              {look.job_status === 'IN_PROGRESS' ? 'In Progress' : 
                               look.job_status === 'SUBMITTED' ? 'Submitted' :
                               look.job_status === 'NEEDS_CHANGES' ? 'Needs Changes' : 'Open'}
                            </Badge>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <Button
                    onClick={handleCreateBatch}
                    disabled={selectedLookIds.size === 0 || createBatch.isPending || checkingBatch}
                    className="gap-2"
                  >
                    {existingBatch ? "Open Existing Batch" : `Create Batch (${selectedLookIds.size} looks)`}
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Sort projects: ready first, then by name
  const sortedProjects = [...(eligibleProjects || [])].sort((a, b) => {
    const aReady = (a.approved_looks_count || 0) > 0;
    const bReady = (b.approved_looks_count || 0) > 0;
    if (aReady && !bReady) return -1;
    if (!aReady && bReady) return 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  // Project selection view
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            Select Production Project
          </CardTitle>
          <CardDescription>
            Choose a project to create a repose batch. Projects pending Photoshop work will show when they become ready.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!sortedProjects || sortedProjects.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No projects available.</p>
              <p className="text-sm mt-2">
                Send jobs to the Job Board to see projects here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedProjects.map((project) => (
                <ProjectTile
                  key={project.id}
                  project={project}
                  onClick={() => handleSelectProject(project.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Project tile component
function ProjectTile({ project, onClick }: { project: ProductionProject; onClick: () => void }) {
  const approvedCount = project.approved_looks_count || 0;
  const totalCount = project.jobs_count || 0;
  const openCount = (project as any).open_jobs_count || 0;
  const inProgressCount = (project as any).in_progress_jobs_count || 0;
  const pendingCount = openCount + inProgressCount;
  const isReady = approvedCount > 0;
  const isPending = totalCount > 0 && approvedCount === 0;

  return (
    <Card 
      className={cn(
        "cursor-pointer transition-all hover:border-primary/50 hover:shadow-md",
        isReady && "border-green-500/30",
        isPending && "border-orange-500/30 bg-orange-50/30 dark:bg-orange-950/10"
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate">{project.name}</h3>
            {project.brand && (
              <p className="text-xs text-muted-foreground">{project.brand.name}</p>
            )}
          </div>
          {isReady ? (
            <Badge variant="outline" className="text-green-600 border-green-500/30 bg-green-500/10">
              Ready
            </Badge>
          ) : isPending ? (
            <Badge variant="outline" className="text-orange-600 border-orange-500/30 bg-orange-500/10">
              <Clock className="w-3 h-3 mr-1" />
              Pending
            </Badge>
          ) : (
            <Badge variant="secondary">In Progress</Badge>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
            <span>{approvedCount} approved</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="w-3.5 h-3.5 text-orange-500" />
            <span>{pendingCount} pending</span>
          </div>
        </div>

        {totalCount > 0 && (
          <div className="mt-3">
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div 
                className={cn(
                  "h-full transition-all",
                  approvedCount > 0 ? "bg-green-500" : "bg-orange-300"
                )}
                style={{ width: `${approvedCount > 0 ? (approvedCount / totalCount) * 100 : 0}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 text-right">
              {approvedCount === 0 
                ? 'Waiting for approvals' 
                : `${Math.round((approvedCount / totalCount) * 100)}% complete`}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
