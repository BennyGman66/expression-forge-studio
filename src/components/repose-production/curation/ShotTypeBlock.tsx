import { useState, useCallback } from "react";
import { ChevronDown, ChevronRight, Check, Circle, RotateCw, Loader2, SkipForward, Undo } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { OutputShotType, OUTPUT_SHOT_LABELS } from "@/types/shot-types";
import type { ReposeOutput } from "@/types/repose";
import { MAX_FAVORITES_PER_VIEW } from "@/types/repose";
import { OutputTile } from "./OutputTile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getImageUrl } from "@/lib/imageUtils";

interface ShotTypeBlockProps {
  shotType: OutputShotType;
  outputs: ReposeOutput[];
  stats: { selected: number; total: number; isComplete: boolean };
  batchId: string;
  batchItemId: string;
  lookId: string;
  sourceUrl?: string; // Source image used for this shot type
  onSelectOutput: (output: ReposeOutput, rank: 1 | 2 | 3 | null) => void;
  onOpenLightbox: (outputId: string) => void;
  getNextAvailableRank: () => 1 | 2 | 3 | null;
  isViewFull: boolean;
  onRefresh: () => void;
  isSkipped?: boolean;
  onSkip?: () => void;
  onUndoSkip?: () => void;
}

export function ShotTypeBlock({
  shotType,
  outputs,
  stats,
  batchId,
  batchItemId,
  lookId,
  sourceUrl,
  onSelectOutput,
  onOpenLightbox,
  getNextAvailableRank,
  isViewFull,
  onRefresh,
  isSkipped = false,
  onSkip,
  onUndoSkip,
}: ShotTypeBlockProps) {
  // Auto-collapse completed blocks
  const [isOpen, setIsOpen] = useState(!stats.isComplete);
  const [rerenderCount, setRerenderCount] = useState<string>("3");
  const [isRerendering, setIsRerendering] = useState(false);
  
  const completedOutputs = outputs.filter(o => o.status === 'complete');
  const pendingOutputs = outputs.filter(o => o.status === 'queued' || o.status === 'running');
  const failedOutputs = outputs.filter(o => o.status === 'failed');
  const selectedOutputs = completedOutputs.filter(o => o.is_favorite).sort((a, b) => 
    (a.favorite_rank || 0) - (b.favorite_rank || 0)
  );

  // Status styling
  const getStatusStyle = () => {
    if (isSkipped) return { bg: "bg-muted/30", text: "text-muted-foreground", border: "border-muted" };
    if (stats.isComplete) return { bg: "bg-primary/10", text: "text-primary", border: "border-primary/30" };
    if (stats.selected > 0) return { bg: "bg-amber-500/10", text: "text-amber-500", border: "border-amber-500/30" };
    return { bg: "bg-muted/50", text: "text-muted-foreground", border: "border-border" };
  };

  const statusStyle = getStatusStyle();

  const handleToggleSelection = (output: ReposeOutput) => {
    if (output.is_favorite) {
      onSelectOutput(output, null);
    } else {
      const nextRank = getNextAvailableRank();
      if (nextRank) {
        onSelectOutput(output, nextRank);
      }
    }
  };

  // Handle re-render for this specific shot type
  const handleRerender = useCallback(async () => {
    const count = parseInt(rerenderCount);
    if (isNaN(count) || count < 1) return;

    setIsRerendering(true);
    try {
      // Create new runs for this specific shot type
      const { data: batch } = await supabase
        .from("repose_batches")
        .select("brand_id, config_json")
        .eq("id", batchId)
        .single();

      if (!batch) {
        throw new Error("Batch not found");
      }

      // Get batch item to get source details
      const { data: batchItem } = await supabase
        .from("repose_batch_items")
        .select("*")
        .eq("id", batchItemId)
        .single();

      if (!batchItem) {
        throw new Error("Batch item not found");
      }

      // Create pipeline job for re-render
      const { data: pipelineJob, error: jobError } = await supabase
        .from("pipeline_jobs")
        .insert({
          type: "REPOSE_GENERATION",
          status: "QUEUED",
          title: `Re-render: ${lookId.slice(0,6)} ${OUTPUT_SHOT_LABELS[shotType]}`,
          origin_route: `/repose-production/batch/${batchId}?tab=review`,
          origin_context: {
            batchId,
            model: (batch.config_json as any)?.model || "google/gemini-3-pro-image-preview",
            shotType,
            isRerender: true,
          },
          progress_total: count,
          progress_done: 0,
          supports_pause: true,
        })
        .select()
        .single();

      if (jobError) throw jobError;

      // Create new runs for re-rendering - INCLUDE brand_id
      const runs = [];
      for (let i = 0; i < count; i++) {
        runs.push({
          batch_id: batchId,
          look_id: lookId,
          brand_id: batch.brand_id, // Critical: include brand_id
          run_index: (Date.now() % 1000000000) + i, // Mod to fit in integer range
          status: "queued",
          config_snapshot: {
            ...(batch.config_json as any),
            brand_id: batch.brand_id,
            shotType, // Specific shot type to render
            isRerender: true,
          },
        });
      }

      const { error: runsError } = await supabase
        .from("repose_runs")
        .insert(runs);

      if (runsError) throw runsError;

      // Trigger the queue processor
      const { error: invokeError } = await supabase.functions.invoke("process-repose-queue", {
        body: {
          batchId,
          pipelineJobId: pipelineJob.id,
          model: (batch.config_json as any)?.model || "google/gemini-3-pro-image-preview",
        },
      });

      if (invokeError) throw invokeError;

      toast.success(`Queued ${count} re-renders for ${OUTPUT_SHOT_LABELS[shotType]}`);
      
      // Open the block to show pending
      setIsOpen(true);
      
      // Refresh to show new queued items
      setTimeout(onRefresh, 1000);

    } catch (error) {
      console.error("Re-render error:", error);
      toast.error(`Failed to start re-render: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRerendering(false);
    }
  }, [batchId, batchItemId, lookId, shotType, rerenderCount, onRefresh]);

  // Retry failed outputs
  const handleRetryFailed = useCallback(async () => {
    if (failedOutputs.length === 0) return;

    setIsRerendering(true);
    try {
      // Reset failed outputs to queued
      const { error } = await supabase
        .from("repose_outputs")
        .update({ status: "queued" })
        .in("id", failedOutputs.map(o => o.id));

      if (error) throw error;

      toast.success(`Retrying ${failedOutputs.length} failed renders`);
      onRefresh();
    } catch (error) {
      toast.error("Failed to retry renders");
    } finally {
      setIsRerendering(false);
    }
  }, [failedOutputs, onRefresh]);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border rounded-lg overflow-hidden">
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-between px-4 py-3 h-auto rounded-none",
            statusStyle.bg
          )}
        >
          <div className="flex items-center gap-3">
            {isOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            
            {/* Source thumbnail for this shot type */}
            {sourceUrl && (
              <div className="w-8 h-8 rounded overflow-hidden border border-border flex-shrink-0 bg-muted">
                <img 
                  src={getImageUrl(sourceUrl, 'tiny')} 
                  alt="Source" 
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            
            <span className="font-medium">{OUTPUT_SHOT_LABELS[shotType]}</span>
            
            {/* Collapsed summary - show selected thumbnails */}
            {!isOpen && stats.isComplete && selectedOutputs.length > 0 && !isSkipped && (
              <div className="flex items-center gap-1 ml-2">
                {selectedOutputs.slice(0, 3).map((output, idx) => (
                  <div key={output.id} className="w-8 h-8 rounded overflow-hidden border border-primary/30">
                    <img 
                      src={getImageUrl(output.result_url, 'tiny')} 
                      alt={`Selected ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
            
            {/* Skipped indicator in collapsed state */}
            {!isOpen && isSkipped && (
              <Badge variant="secondary" className="ml-2 gap-1 text-muted-foreground">
                <SkipForward className="w-3 h-3" />
                Skipped
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Pending indicator */}
            {pendingOutputs.length > 0 && !isSkipped && (
              <Badge variant="outline" className="gap-1.5 text-blue-600 border-blue-300">
                <Loader2 className="w-3 h-3 animate-spin" />
                {pendingOutputs.length} rendering
              </Badge>
            )}
            
            {/* Failed indicator */}
            {failedOutputs.length > 0 && !isSkipped && (
              <Badge variant="outline" className="gap-1.5 text-destructive border-destructive/30">
                {failedOutputs.length} failed
              </Badge>
            )}

            {/* Skip button - only show when not already skipped and has handler */}
            {!isSkipped && onSkip && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={(e) => {
                  e.stopPropagation();
                  onSkip();
                }}
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <SkipForward className="w-3 h-3 mr-1" />
                Skip
              </Button>
            )}

            {/* Status Badge */}
            {isSkipped ? (
              <Badge
                variant="secondary"
                className="gap-1.5 text-muted-foreground"
              >
                <SkipForward className="w-3 h-3" />
                Skipped
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className={cn(
                  "gap-1.5",
                  statusStyle.text,
                  statusStyle.border
                )}
              >
                {stats.isComplete ? (
                  <Check className="w-3 h-3" />
                ) : (
                  <Circle className="w-2 h-2 fill-current" />
                )}
                {stats.selected} / {MAX_FAVORITES_PER_VIEW}
              </Badge>
            )}
          </div>
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="p-4 bg-background">
          {/* Skipped state */}
          {isSkipped ? (
            <div className="py-6 text-center">
              <p className="text-sm text-muted-foreground mb-3">
                This view has been skipped and will be marked as complete.
              </p>
              {onUndoSkip && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={onUndoSkip}
                  className="gap-1.5"
                >
                  <Undo className="w-3.5 h-3.5" />
                  Undo Skip
                </Button>
              )}
            </div>
          ) : completedOutputs.length === 0 && pendingOutputs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No outputs for this view yet
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {/* Completed outputs */}
              {completedOutputs.map((output) => (
                <OutputTile
                  key={output.id}
                  output={output}
                  onToggleSelection={() => handleToggleSelection(output)}
                  onOpenLightbox={() => onOpenLightbox(output.id)}
                  isViewFull={isViewFull && !output.is_favorite}
                />
              ))}
              
              {/* Pending outputs - placeholder tiles */}
              {pendingOutputs.map((output) => (
                <div
                  key={output.id}
                  className="aspect-[3/4] rounded-lg border-2 border-dashed border-muted flex flex-col items-center justify-center gap-2 bg-muted/20"
                >
                  {output.status === 'running' ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">Rendering...</span>
                    </>
                  ) : (
                    <>
                      <Circle className="w-5 h-5 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">Queued</span>
                    </>
                  )}
                </div>
              ))}
              
              {/* Failed outputs */}
              {failedOutputs.map((output) => (
                <div
                  key={output.id}
                  className="aspect-[3/4] rounded-lg border-2 border-dashed border-destructive/30 flex flex-col items-center justify-center gap-2 bg-destructive/5"
                >
                  <span className="text-xs text-destructive">Failed</span>
                </div>
              ))}
            </div>
          )}
          
          {/* Re-render Controls */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              {failedOutputs.length > 0 && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleRetryFailed}
                  disabled={isRerendering}
                  className="gap-1.5 text-destructive hover:text-destructive"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  Retry {failedOutputs.length} failed
                </Button>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <Select value={rerenderCount} onValueChange={setRerenderCount}>
                <SelectTrigger className="w-16 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                </SelectContent>
              </Select>
              
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleRerender}
                disabled={isRerendering}
                className="gap-1.5"
              >
                {isRerendering ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RotateCw className="w-3.5 h-3.5" />
                )}
                Re-render
              </Button>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
