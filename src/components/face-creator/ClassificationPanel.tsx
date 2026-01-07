import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, 
  Play, 
  Users, 
  User, 
  X,
  Trash2,
  Square,
} from "lucide-react";
import {
  ModelColumnView,
  ModelNavigator,
  useModelData,
  useImageSelection,
  useImageOperations,
  GenderFilter,
  IdentityImage,
} from "./classification";

interface ClassificationPanelProps {
  runId: string | null;
}

export function ClassificationPanel({ runId }: ClassificationPanelProps) {
  const { toast } = useToast();
  const [isRunningAI, setIsRunningAI] = useState(false);
  const [selectedGender, setSelectedGender] = useState<GenderFilter>('all');
  const [jobProgress, setJobProgress] = useState<{ progress: number; total: number; status: string; isPaused?: boolean } | null>(null);
  
  // Navigator state
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedModelId, setFocusedModelId] = useState<string | null>(null);
  const [showUnclassified, setShowUnclassified] = useState(false);
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set());
  
  // Unclassified images
  const [unclassifiedImages, setUnclassifiedImages] = useState<any[]>([]);

  // Use new hooks
  const { identities, imagesByIdentity, isLoading, refetch, refetchSilent } = useModelData(runId, selectedGender);
  const selection = useImageSelection();
  const operations = useImageOperations(refetch, refetchSilent);

  // Fetch unclassified images
  useEffect(() => {
    if (!runId) {
      setUnclassifiedImages([]);
      return;
    }

    async function fetchUnclassified() {
      const { data: allImages } = await supabase
        .from('face_scrape_images')
        .select('id, stored_url, source_url, gender')
        .eq('scrape_run_id', runId);

      const { data: classifiedLinks } = await supabase
        .from('face_identity_images')
        .select('scrape_image_id')
        .eq('is_ignored', false);

      const classifiedIds = new Set((classifiedLinks || []).map(l => l.scrape_image_id));
      const unclassified = (allImages || []).filter(img => !classifiedIds.has(img.id));
      setUnclassifiedImages(unclassified);
    }

    fetchUnclassified();
  }, [runId, identities]);

  // Subscribe to job progress
  useEffect(() => {
    if (!runId) return;

    const checkActiveJobs = async () => {
      const { data } = await supabase
        .from('pipeline_jobs')
        .select('id, status, progress_done, progress_total, type')
        .or(`origin_context->scrape_run_id.eq.${runId},origin_context->>scrape_run_id.eq.${runId}`)
        .in('status', ['RUNNING', 'PAUSED'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (data) {
        if (data.status === 'RUNNING') {
          setIsRunningAI(true);
          setJobProgress({
            progress: data.progress_done || 0,
            total: data.progress_total || 0,
            status: data.type,
          });
        } else if (data.status === 'PAUSED') {
          setIsRunningAI(false);
          setJobProgress({
            progress: data.progress_done || 0,
            total: data.progress_total || 0,
            status: data.type,
            isPaused: true,
          });
        }
      }
    };
    checkActiveJobs();

    const pollInterval = setInterval(async () => {
      if (!isRunningAI) return;
      
      const { data } = await supabase
        .from('pipeline_jobs')
        .select('id, status, progress_done, progress_total, type')
        .or(`origin_context->scrape_run_id.eq.${runId},origin_context->>scrape_run_id.eq.${runId}`)
        .in('status', ['RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELED'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (data) {
        if (data.status === 'RUNNING') {
          setJobProgress({
            progress: data.progress_done || 0,
            total: data.progress_total || 0,
            status: data.type,
          });
        } else if (data.status === 'PAUSED') {
          setJobProgress({
            progress: data.progress_done || 0,
            total: data.progress_total || 0,
            status: data.type,
            isPaused: true,
          });
          setIsRunningAI(false);
        } else if (data.status === 'COMPLETED' || data.status === 'FAILED' || data.status === 'CANCELED') {
          setJobProgress(null);
          setIsRunningAI(false);
          if (data.status === 'COMPLETED') {
            toast({ title: "AI classification completed" });
            refetch();
          }
        }
      }
    }, 2000);

    const channel = supabase
      .channel('pipeline-job-progress')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pipeline_jobs',
        },
        (payload) => {
          const job = payload.new as any;
          const jobRunId = job.origin_context?.scrape_run_id;
          if (jobRunId !== runId) return;
          
          if (job.status === 'RUNNING') {
            setIsRunningAI(true);
            setJobProgress({
              progress: job.progress_done || 0,
              total: job.progress_total || 0,
              status: job.type,
            });
          } else if (job.status === 'PAUSED') {
            setJobProgress({
              progress: job.progress_done || 0,
              total: job.progress_total || 0,
              status: job.type,
              isPaused: true,
            });
            setIsRunningAI(false);
          } else if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELED') {
            setJobProgress(null);
            setIsRunningAI(false);
            if (job.status === 'COMPLETED') {
              toast({ title: "AI classification completed" });
              refetch();
            }
          }
        }
      )
      .subscribe();
    
    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [runId, toast, isRunningAI, refetch]);

  const handleRunAllAI = async () => {
    if (!runId) {
      toast({ title: "No scrape run selected", variant: "destructive" });
      return;
    }

    setIsRunningAI(true);
    try {
      const { error } = await supabase.functions.invoke('classify-all', {
        body: { runId },
      });

      if (error) throw error;
      toast({ title: "AI classification started", description: "This may take a few minutes" });
    } catch (error) {
      console.error('Error running AI classification:', error);
      toast({ title: "Failed to start AI classification", variant: "destructive" });
      setIsRunningAI(false);
    }
  };

  const handleCancelJob = async () => {
    if (!runId) return;
    
    try {
      const { error } = await supabase
        .from('pipeline_jobs')
        .update({ status: 'CANCELED', completed_at: new Date().toISOString() })
        .or(`origin_context->scrape_run_id.eq.${runId},origin_context->>scrape_run_id.eq.${runId}`)
        .in('status', ['RUNNING', 'PAUSED']);
      
      if (error) throw error;
      
      setIsRunningAI(false);
      setJobProgress(null);
      toast({ title: "Jobs canceled" });
    } catch (error) {
      console.error('Error canceling jobs:', error);
      toast({ title: "Failed to cancel jobs", variant: "destructive" });
    }
  };

  const handlePreFilter = async () => {
    if (!runId) return;

    try {
      setIsRunningAI(true);
      const { error } = await supabase.functions.invoke('organize-face-images', {
        body: { scrapeRunId: runId },
      });

      if (error) throw error;
      toast({ title: "Pre-filter started", description: "Removing kids, shoes, and junk images..." });
    } catch (error) {
      console.error('Error running pre-filter:', error);
      toast({ title: "Failed to start pre-filter", variant: "destructive" });
      setIsRunningAI(false);
    }
  };

  const handleResetClassification = async () => {
    if (!runId) return;
    if (!confirm('This will delete all model groupings and start fresh. Continue?')) return;

    try {
      for (const identity of identities) {
        await supabase
          .from('face_identity_images')
          .delete()
          .eq('identity_id', identity.id);
      }

      await supabase
        .from('face_identities')
        .delete()
        .eq('scrape_run_id', runId);

      refetch();
      toast({ title: "Classification reset complete" });
    } catch (error) {
      console.error('Error resetting classification:', error);
      toast({ title: "Failed to reset classification", variant: "destructive" });
    }
  };

  // Model operations
  const handleMoveImages = useCallback(async (imageIds: string[], sourceId: string, targetId: string) => {
    await operations.moveImages(imageIds, sourceId, targetId, imagesByIdentity);
  }, [operations, imagesByIdentity]);

  const handleSplitImages = useCallback(async (imageIds: string[], sourceId: string, customName?: string) => {
    if (!runId) return;
    await operations.splitToNewModel(imageIds, sourceId, runId, identities, imagesByIdentity, customName);
  }, [operations, runId, identities, imagesByIdentity]);

  const handleMergeModels = useCallback(async (sourceIds: string[], targetId: string) => {
    await operations.mergeModels(sourceIds, targetId, identities);
  }, [operations, identities]);

  const handleDeleteImages = useCallback(async (imageIds: string[]) => {
    await operations.deleteImages(imageIds);
  }, [operations]);

  const handleDeleteModel = useCallback(async (identityId: string) => {
    if (!confirm('Delete this model and all its images?')) return;
    await operations.deleteModels([identityId]);
  }, [operations]);

  const handleDeleteSelectedModels = useCallback(async () => {
    if (selectedModelIds.size === 0) return;
    if (!confirm(`Delete ${selectedModelIds.size} models and all their images?`)) return;
    await operations.deleteModels(Array.from(selectedModelIds));
    setSelectedModelIds(new Set());
  }, [operations, selectedModelIds]);

  // Navigator handlers
  const handleToggleModelSelect = useCallback((identityId: string) => {
    setSelectedModelIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(identityId)) {
        newSet.delete(identityId);
      } else {
        newSet.add(identityId);
      }
      return newSet;
    });
  }, []);

  const handleSelectAllModels = useCallback(() => {
    setSelectedModelIds(new Set(identities.map(i => i.id)));
  }, [identities]);

  const handleClearModelSelection = useCallback(() => {
    setSelectedModelIds(new Set());
  }, []);

  if (!runId) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Select a scrape run from the Scrape tab first
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex h-[calc(100vh-140px)] bg-background rounded-lg border overflow-hidden">
      {/* Left Sidebar - Controls + Navigator */}
      <div className="w-64 flex-shrink-0 border-r border-border flex flex-col">
        {/* Workflow Controls */}
        <div className="p-4 border-b border-border space-y-3">
          {/* Workflow Guidance */}
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p className="font-medium text-foreground">Workflow:</p>
            <ol className="list-decimal list-inside">
              <li>Pre-filter (removes junk)</li>
              <li>Classify Models (groups faces)</li>
            </ol>
          </div>

          {/* Pre-filter Button */}
          <Button
            onClick={handlePreFilter}
            disabled={isRunningAI}
            variant="outline"
            size="sm"
            className="w-full"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Pre-filter Junk
          </Button>

          {/* Classify Models Button */}
          <div className="flex gap-2">
            <Button
              onClick={handleRunAllAI}
              disabled={isRunningAI}
              className="flex-1"
              size="sm"
            >
              {isRunningAI ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : jobProgress?.isPaused ? (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Resume ({jobProgress.progress}/{jobProgress.total})
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Classify
                </>
              )}
            </Button>
            
            {(isRunningAI || jobProgress) && (
              <Button
                onClick={handleCancelJob}
                variant="destructive"
                size="sm"
              >
                <Square className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Reset Button */}
          {identities.length > 0 && (
            <Button
              onClick={handleResetClassification}
              disabled={isLoading || isRunningAI}
              variant="ghost"
              size="sm"
              className="w-full text-destructive hover:text-destructive"
            >
              <X className="h-4 w-4 mr-2" />
              Reset Classification
            </Button>
          )}

          {jobProgress && (
            <div className="bg-muted/50 rounded-md px-3 py-2">
              <p className="text-xs font-medium capitalize">{jobProgress.status.replace(/_/g, ' ')}</p>
              <p className="text-xs text-muted-foreground">
                {jobProgress.progress} / {jobProgress.total}
              </p>
            </div>
          )}

          {/* Gender Filter */}
          <div className="flex gap-1.5 pt-2">
            <Button
              variant={selectedGender === 'all' ? 'default' : 'outline'}
              size="sm"
              className="flex-1 h-7 text-xs"
              onClick={() => setSelectedGender('all')}
            >
              <Users className="h-3 w-3 mr-1" />
              All
            </Button>
            <Button
              variant={selectedGender === 'women' ? 'default' : 'outline'}
              size="sm"
              className="flex-1 h-7 text-xs"
              onClick={() => setSelectedGender('women')}
            >
              <User className="h-3 w-3 mr-1" />
              W
            </Button>
            <Button
              variant={selectedGender === 'men' ? 'default' : 'outline'}
              size="sm"
              className="flex-1 h-7 text-xs"
              onClick={() => setSelectedGender('men')}
            >
              <User className="h-3 w-3 mr-1" />
              M
            </Button>
          </div>
        </div>

        {/* Model Navigator */}
        <ModelNavigator
          identities={identities}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onModelClick={setFocusedModelId}
          focusedModelId={focusedModelId}
          unclassifiedCount={unclassifiedImages.length}
          onUnclassifiedClick={() => setShowUnclassified(true)}
          showUnclassified={showUnclassified}
          selectedModelIds={selectedModelIds}
          onToggleModelSelect={handleToggleModelSelect}
          onSelectAllModels={handleSelectAllModels}
          onClearModelSelection={handleClearModelSelection}
          onDeleteSelectedModels={handleDeleteSelectedModels}
        />
      </div>

      {/* Main Content - Column View */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ModelColumnView
          identities={identities}
          imagesByIdentity={imagesByIdentity}
          selectedImageIds={selection.selectedImageIds}
          onImageSelect={selection.selectImage}
          onImageToggle={selection.toggleSelection}
          onClearSelection={selection.clearSelection}
          onSelectAllInColumn={selection.selectAll}
          onMoveImages={handleMoveImages}
          onSplitImages={handleSplitImages}
          onMergeModels={handleMergeModels}
          onDeleteImages={handleDeleteImages}
          onDeleteModel={handleDeleteModel}
          selectedModelIds={selectedModelIds}
          onToggleModelSelect={handleToggleModelSelect}
          isOperating={operations.isOperating}
        />
      )}
    </div>
  );
}
