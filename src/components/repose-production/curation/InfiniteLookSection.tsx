import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ALL_OUTPUT_SHOT_TYPES, OutputShotType, OUTPUT_SHOT_LABELS } from "@/types/shot-types";
import type { ReposeOutput } from "@/types/repose";
import type { LookWithOutputs } from "@/hooks/useReposeSelection";
import { ShotTypeBlock } from "./ShotTypeBlock";
import { cn } from "@/lib/utils";
import { Check, RotateCw, Loader2, AlertCircle, X, ChevronDown, Trash2, Play } from "lucide-react";
import { getImageUrl } from "@/lib/imageUtils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface InfiniteLookSectionProps {
  look: LookWithOutputs;
  batchId: string;
  outputs: ReposeOutput[];
  onSelectOutput: (output: ReposeOutput, rank: 1 | 2 | 3 | null) => void;
  onOpenLightbox: (outputId: string) => void;
  getNextAvailableRank: (shotType: OutputShotType) => 1 | 2 | 3 | null;
  isViewFull: (shotType: OutputShotType) => boolean;
  isViewSkipped: (shotType: OutputShotType) => boolean;
  onSkipView: (shotType: OutputShotType) => void;
  onUndoSkipView: (shotType: OutputShotType) => void;
  onRefresh: () => void;
}

export function InfiniteLookSection({
  look,
  batchId,
  outputs,
  onSelectOutput,
  onOpenLightbox,
  getNextAvailableRank,
  isViewFull,
  isViewSkipped,
  onSkipView,
  onUndoSkipView,
  onRefresh,
}: InfiniteLookSectionProps) {
  const queryClient = useQueryClient();
  const [rerenderCount, setRerenderCount] = useState<string>("5");
  const [isRerendering, setIsRerendering] = useState(false);
  const [selectedShotTypes, setSelectedShotTypes] = useState<OutputShotType[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const toggleShotType = (shotType: OutputShotType) => {
    setSelectedShotTypes(prev => 
      prev.includes(shotType) 
        ? prev.filter(st => st !== shotType)
        : [...prev, shotType]
    );
  };

  const allSelected = selectedShotTypes.length === ALL_OUTPUT_SHOT_TYPES.length;

  // Get shot types that have outputs (completed or pending)
  const activeShots = ALL_OUTPUT_SHOT_TYPES.filter(shotType => {
    const viewOutputs = look.outputsByView[shotType] || [];
    return viewOutputs.length > 0;
  });

  // Count status across all outputs for this look
  const allOutputs = Object.values(look.outputsByView).flat();
  const queuedCount = allOutputs.filter(o => o.status === 'queued').length;
  const runningCount = allOutputs.filter(o => o.status === 'running').length;
  const failedCount = allOutputs.filter(o => o.status === 'failed').length;
  const completeCount = allOutputs.filter(o => o.status === 'complete').length;
  const hasNoOutputs = allOutputs.length === 0;
  const hasPending = queuedCount > 0 || runningCount > 0;
  const hasFailed = failedCount > 0;

  const isComplete = look.selectionStats.isAllComplete;

  // Re-render selected shot types for this look
  const handleRerenderSelected = useCallback(async () => {
    const count = parseInt(rerenderCount);
    if (isNaN(count) || count < 1) return;
    if (selectedShotTypes.length === 0) {
      toast.error("Please select at least one shot type");
      return;
    }

    setIsRerendering(true);
    setDropdownOpen(false);
    try {
      // Get batch config
      const { data: batch } = await supabase
        .from("repose_batches")
        .select("brand_id, config_json")
        .eq("id", batchId)
        .single();

      if (!batch) throw new Error("Batch not found");

      const shotTypesLabel = allSelected 
        ? "all views" 
        : selectedShotTypes.map(st => OUTPUT_SHOT_LABELS[st]).join(", ");

      // Create pipeline job for re-render
      const { data: pipelineJob, error: jobError } = await supabase
        .from("pipeline_jobs")
        .insert({
          type: "REPOSE_GENERATION",
          status: "QUEUED",
          title: `Re-render ${shotTypesLabel}: ${look.lookCode}`,
          origin_route: `/repose-production/batch/${batchId}?tab=review`,
          origin_context: {
            batchId,
            model: (batch.config_json as any)?.model || "google/gemini-3-pro-image-preview",
            isRerender: true,
            lookId: look.lookId,
            shotTypes: selectedShotTypes,
          },
          progress_total: count * selectedShotTypes.length,
          progress_done: 0,
          supports_pause: true,
        })
        .select()
        .single();

      if (jobError) throw jobError;

      // Create new runs for re-rendering selected views - INCLUDE brand_id and shotTypes
      const runs = [];
      for (let i = 0; i < count; i++) {
        runs.push({
          batch_id: batchId,
          look_id: look.lookId,
          brand_id: batch.brand_id, // Critical: include brand_id
          run_index: (Date.now() % 1000000000) + i, // Mod to fit in integer range
          status: "queued",
          config_snapshot: {
            ...(batch.config_json as any),
            brand_id: batch.brand_id,
            isRerender: true,
            shotTypes: selectedShotTypes, // Pass selected shot types to backend
          },
        });
      }

      const { error: runsError } = await supabase
        .from("repose_runs")
        .insert(runs);

      if (runsError) throw runsError;

      // Trigger the queue processor with 4K resolution
      const { error: invokeError } = await supabase.functions.invoke("process-repose-queue", {
        body: {
          batchId,
          pipelineJobId: pipelineJob.id,
          model: (batch.config_json as any)?.model || "google/gemini-3-pro-image-preview",
          imageSize: "4K",
        },
      });

      if (invokeError) throw invokeError;

      toast.success(`Queued ${count} re-renders for ${shotTypesLabel}`);
      setTimeout(onRefresh, 1000);
    } catch (error) {
      console.error("Re-render error:", error);
      toast.error(`Failed to start re-render: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRerendering(false);
    }
  }, [batchId, look.lookId, look.lookCode, rerenderCount, selectedShotTypes, allSelected, onRefresh]);

  // Cancel all pending outputs for this look
  const handleCancelPending = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    const pendingOutputIds = allOutputs
      .filter(o => o.status === 'queued' || o.status === 'running')
      .map(o => o.id);
    
    if (pendingOutputIds.length === 0) {
      toast.info("No pending outputs to cancel");
      return;
    }
    
    try {
      const { error } = await supabase
        .from("repose_outputs")
        .update({ 
          status: "failed", 
          error_message: "Cancelled by user" 
        })
        .in("id", pendingOutputIds);
      
      if (error) throw error;
      
      // Force invalidate queries to refresh UI
      await queryClient.invalidateQueries({ queryKey: ["repose-outputs"] });
      await queryClient.invalidateQueries({ queryKey: ["repose-batch-items"] });
      
      toast.success(`Cancelled ${pendingOutputIds.length} pending renders`);
      onRefresh();
    } catch (error) {
      console.error("Cancel error:", error);
      toast.error("Failed to cancel pending renders");
    }
  }, [allOutputs, onRefresh, queryClient]);

  // Resume processing stalled pending outputs
  const handleResumePending = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    const pendingCount = queuedCount + runningCount;
    if (pendingCount === 0) {
      toast.info("No pending outputs to resume");
      return;
    }
    
    try {
      toast.info(`Resuming ${pendingCount} pending outputs...`);
      
      const { error } = await supabase.functions.invoke("process-repose-queue", {
        body: { batchId, imageSize: "4K" },
      });
      
      if (error) throw error;
      toast.success(`Queue processing resumed`);
    } catch (error) {
      console.error("Resume error:", error);
      toast.error("Failed to resume processing");
    }
  }, [batchId, queuedCount, runningCount]);

  // Retry all failed outputs
  const handleRetryAllFailed = useCallback(async () => {
    const failedOutputIds = allOutputs.filter(o => o.status === 'failed').map(o => o.id);
    if (failedOutputIds.length === 0) return;

    setIsRerendering(true);
    try {
      const { error } = await supabase
        .from("repose_outputs")
        .update({ status: "queued" })
        .in("id", failedOutputIds);

      if (error) throw error;

      toast.success(`Retrying ${failedOutputIds.length} failed renders`);
      onRefresh();
    } catch (error) {
      toast.error("Failed to retry renders");
    } finally {
      setIsRerendering(false);
    }
  }, [allOutputs, onRefresh]);

  // Clear all failed outputs for this look
  const handleClearFailed = useCallback(async () => {
    const failedOutputIds = allOutputs.filter(o => o.status === 'failed').map(o => o.id);
    if (failedOutputIds.length === 0) return;

    try {
      const { error } = await supabase
        .from("repose_outputs")
        .delete()
        .in("id", failedOutputIds);

      if (error) throw error;

      toast.success(`Cleared ${failedOutputIds.length} failed outputs`);
      onRefresh();
    } catch (error) {
      console.error("Clear failed error:", error);
      toast.error("Failed to clear failed outputs");
    }
  }, [allOutputs, onRefresh]);

  return (
    <Card className={cn(
      "overflow-hidden transition-colors",
      isComplete && "ring-2 ring-primary/30"
    )}>
      {/* Look Header - Clear separation */}
      <CardHeader className="pb-3 bg-secondary/30 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Source Preview Thumbnail */}
            {look.sourceUrl && (
              <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted flex-shrink-0 border border-border">
                <img 
                  src={getImageUrl(look.sourceUrl, 'tiny')} 
                  alt="Source" 
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            )}
            
            {/* Look Info */}
            <div>
              <h2 className="text-lg font-serif font-semibold tracking-tight">
                {look.lookCode}
              </h2>
              <p className="text-sm text-muted-foreground">
                Select your top 3 favorites for each shot type
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Status Indicators */}
            {hasPending && (
              <div className="flex items-center gap-1">
                <Badge 
                  variant="outline" 
                  className="gap-1.5 text-blue-600 border-blue-300"
                >
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {queuedCount + runningCount} pending
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-green-600 hover:text-green-700 hover:bg-green-100"
                  onClick={handleResumePending}
                  title="Resume processing"
                >
                  <Play className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={handleCancelPending}
                  title="Cancel pending renders"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
            
            {hasFailed && (
              <div className="flex items-center gap-1">
                <Badge 
                  variant="outline" 
                  className="gap-1.5 text-destructive border-destructive/30 cursor-pointer hover:bg-destructive/10" 
                  onClick={handleRetryAllFailed}
                >
                  <AlertCircle className="w-3 h-3" />
                  {failedCount} failed - Retry
                </Badge>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear failed outputs?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete {failedCount} failed output{failedCount !== 1 ? 's' : ''} for {look.lookCode}. 
                        This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={handleClearFailed}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Clear {failedCount} Failed
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
            
            {hasNoOutputs && (
              <Badge variant="outline" className="gap-1.5 text-amber-600 border-amber-300">
                <AlertCircle className="w-3 h-3" />
                No outputs
              </Badge>
            )}

            {/* Re-render Controls with Shot Type Selection */}
            <div className="flex items-center gap-2 border-l pl-3 ml-2">
              <Select value={rerenderCount} onValueChange={setRerenderCount}>
                <SelectTrigger className="w-16 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="15">15</SelectItem>
                </SelectContent>
              </Select>
              
              <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm"
                    disabled={isRerendering}
                    className="gap-1.5"
                  >
                    {isRerendering ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RotateCw className="w-3.5 h-3.5" />
                    )}
                    {selectedShotTypes.length === 0 
                      ? "Select shots..." 
                      : allSelected 
                        ? "Re-render All" 
                        : `Re-render (${selectedShotTypes.length})`}
                    <ChevronDown className="w-3 h-3 ml-0.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <div className="flex items-center justify-between px-2 py-1.5 border-b">
                    <span className="text-xs font-medium text-muted-foreground">Shot Types</span>
                    <div className="flex gap-1">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 px-2 text-xs"
                        onClick={() => setSelectedShotTypes([...ALL_OUTPUT_SHOT_TYPES])}
                      >
                        All
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 px-2 text-xs"
                        onClick={() => setSelectedShotTypes([])}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                  <div className="p-2 space-y-2">
                    {ALL_OUTPUT_SHOT_TYPES.map((shotType) => (
                      <label 
                        key={shotType}
                        className="flex items-center gap-2 cursor-pointer hover:bg-accent rounded px-2 py-1.5"
                      >
                        <Checkbox
                          checked={selectedShotTypes.includes(shotType)}
                          onCheckedChange={() => toggleShotType(shotType)}
                        />
                        <span className="text-sm">{OUTPUT_SHOT_LABELS[shotType]}</span>
                      </label>
                    ))}
                  </div>
                  <DropdownMenuSeparator />
                  <div className="p-2">
                    <Button 
                      size="sm" 
                      className="w-full gap-1.5"
                      onClick={handleRerenderSelected}
                      disabled={selectedShotTypes.length === 0 || isRerendering}
                    >
                      {isRerendering ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCw className="w-3.5 h-3.5" />
                      )}
                      {selectedShotTypes.length === 0 
                        ? "Select shots to re-render" 
                        : allSelected 
                          ? "Re-render All" 
                          : `Re-render ${selectedShotTypes.length} Selected`}
                    </Button>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            
            {/* Status Badge */}
            <Badge 
              variant={isComplete ? "default" : "outline"}
              className={cn(
                "gap-1.5 px-3 py-1",
                isComplete && "bg-primary"
              )}
            >
              {isComplete && <Check className="w-3 h-3" />}
              {look.selectionStats.completedViews} / {look.selectionStats.totalViews} complete
              {look.selectionStats.skippedViews > 0 && (
                <span className="text-xs opacity-70">({look.selectionStats.skippedViews} skipped)</span>
              )}
            </Badge>
          </div>
        </div>
      </CardHeader>

      {/* Shot Type Blocks - Main Content */}
      <CardContent className="p-4 space-y-3">
        {activeShots.length === 0 ? (
          <div className="text-center py-8 space-y-3">
            <p className="text-sm text-muted-foreground">
              No outputs for this look yet
            </p>
            <Button 
              variant="default" 
              size="sm"
              onClick={handleRerenderSelected}
              disabled={isRerendering}
              className="gap-1.5"
            >
              {isRerendering ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCw className="w-3.5 h-3.5" />
              )}
              Generate {rerenderCount} outputs
            </Button>
          </div>
        ) : (
          activeShots.map((shotType) => {
            const viewOutputs = look.outputsByView[shotType] || [];
            const stats = look.selectionStats.byView[shotType];
            
            if (!stats) return null;

            return (
              <ShotTypeBlock
                key={shotType}
                shotType={shotType}
                outputs={viewOutputs}
                stats={stats}
                batchId={batchId}
                batchItemId={look.batchItemId}
                lookId={look.lookId}
                sourceUrl={look.sourceUrlsByView?.[shotType]}
                onSelectOutput={onSelectOutput}
                onOpenLightbox={onOpenLightbox}
                getNextAvailableRank={() => getNextAvailableRank(shotType)}
                isViewFull={isViewFull(shotType)}
                onRefresh={onRefresh}
                isSkipped={isViewSkipped(shotType)}
                onSkip={() => onSkipView(shotType)}
                onUndoSkip={() => onUndoSkipView(shotType)}
              />
            );
          })
        )}
      </CardContent>
    </Card>
  );
}