import { useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ALL_OUTPUT_SHOT_TYPES, OutputShotType, OUTPUT_SHOT_LABELS } from "@/types/shot-types";
import type { ReposeOutput } from "@/types/repose";
import type { LookWithOutputs } from "@/hooks/useReposeSelection";
import { ShotTypeBlock } from "./ShotTypeBlock";
import { cn } from "@/lib/utils";
import { Check, RotateCw, Loader2, AlertCircle } from "lucide-react";
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
  onRefresh,
}: InfiniteLookSectionProps) {
  const [rerenderCount, setRerenderCount] = useState<string>("5");
  const [isRerendering, setIsRerendering] = useState(false);

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

  // Re-render all views for this look
  const handleRerenderAll = useCallback(async () => {
    const count = parseInt(rerenderCount);
    if (isNaN(count) || count < 1) return;

    setIsRerendering(true);
    try {
      // Get batch config
      const { data: batch } = await supabase
        .from("repose_batches")
        .select("brand_id, config_json")
        .eq("id", batchId)
        .single();

      if (!batch) throw new Error("Batch not found");

      // Create pipeline job for re-render
      const { data: pipelineJob, error: jobError } = await supabase
        .from("pipeline_jobs")
        .insert({
          type: "REPOSE_GENERATION",
          status: "QUEUED",
          title: `Re-render All: ${look.lookCode}`,
          origin_route: `/repose-production/batch/${batchId}?tab=review`,
          origin_context: {
            batchId,
            model: (batch.config_json as any)?.model || "google/gemini-3-pro-image-preview",
            isRerender: true,
            lookId: look.lookId,
          },
          progress_total: count,
          progress_done: 0,
          supports_pause: true,
        })
        .select()
        .single();

      if (jobError) throw jobError;

      // Create new runs for re-rendering all views
      const runs = [];
      for (let i = 0; i < count; i++) {
        runs.push({
          batch_id: batchId,
          look_id: look.lookId,
          run_index: Date.now() + i,
          status: "queued",
          config_snapshot: {
            ...(batch.config_json as any),
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

      toast.success(`Queued ${count} re-renders for all views`);
      setTimeout(onRefresh, 1000);
    } catch (error) {
      console.error("Re-render error:", error);
      toast.error(`Failed to start re-render: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRerendering(false);
    }
  }, [batchId, look.lookId, look.lookCode, rerenderCount, onRefresh]);

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
              <Badge variant="outline" className="gap-1.5 text-blue-600 border-blue-300">
                <Loader2 className="w-3 h-3 animate-spin" />
                {queuedCount + runningCount} pending
              </Badge>
            )}
            
            {hasFailed && (
              <Badge variant="outline" className="gap-1.5 text-destructive border-destructive/30 cursor-pointer hover:bg-destructive/10" onClick={handleRetryAllFailed}>
                <AlertCircle className="w-3 h-3" />
                {failedCount} failed - Click to retry
              </Badge>
            )}
            
            {hasNoOutputs && (
              <Badge variant="outline" className="gap-1.5 text-amber-600 border-amber-300">
                <AlertCircle className="w-3 h-3" />
                No outputs
              </Badge>
            )}

            {/* Re-render All Controls */}
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
              
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleRerenderAll}
                disabled={isRerendering}
                className="gap-1.5"
              >
                {isRerendering ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RotateCw className="w-3.5 h-3.5" />
                )}
                Re-render All
              </Button>
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
              onClick={handleRerenderAll}
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
                onSelectOutput={onSelectOutput}
                onOpenLightbox={onOpenLightbox}
                getNextAvailableRank={() => getNextAvailableRank(shotType)}
                isViewFull={isViewFull(shotType)}
                onRefresh={onRefresh}
              />
            );
          })
        )}
      </CardContent>
    </Card>
  );
}