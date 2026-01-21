import { useState, useRef, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertCircle, Check, Loader2, Play, RefreshCw, RotateCcw, Trash2, Zap } from "lucide-react";
import { useReposeBatch } from "@/hooks/useReposeBatches";
import { useReposeSelection } from "@/hooks/useReposeSelection";
import { useAutoResumeQueue } from "@/hooks/useAutoResumeQueue";
import { LeapfrogLoader } from "@/components/ui/LeapfrogLoader";
import { CurationLightbox } from "./CurationLightbox";
import { InfiniteLookSection } from "./InfiniteLookSection";
import { InfiniteSidebar } from "./InfiniteSidebar";
import { ALL_OUTPUT_SHOT_TYPES, OutputShotType, slotToShotType } from "@/types/shot-types";
import type { ReposeOutput } from "@/types/repose";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface InfiniteReviewPanelProps {
  batchId: string | undefined;
  onExportReady?: () => void;
}

interface LightboxImage {
  id: string;
  url: string;
  shotType: OutputShotType;
  output: ReposeOutput;
  lookCode: string;
}

export function InfiniteReviewPanel({ batchId, onExportReady }: InfiniteReviewPanelProps) {
  const { data: batch, isLoading: batchLoading } = useReposeBatch(batchId);
  const {
    outputs,
    batchItems,
    groupedByLook,
    overallStats,
    isLoading,
    setFavoriteRank,
    getNextAvailableRank,
    isViewFull,
    isViewSkipped,
    skipView,
    undoSkipView,
    refetchAll,
  } = useReposeSelection(batchId);

  // Auto-resume queue hook
  const autoResume = useAutoResumeQueue({
    batchId,
    enabled: true,
    pollIntervalMs: 30000,
    onResume: refetchAll,
  });

  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const lookRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [currentLightboxLookId, setCurrentLightboxLookId] = useState<string | null>(null);

  // Calculate shot types complete, pending, and failed counts
  const { shotTypesStats, pendingCount, failedCount } = useMemo(() => {
    let totalShotTypes = 0;
    let completeShotTypes = 0;
    let pending = 0;
    let failed = 0;
    
    for (const look of groupedByLook) {
      for (const shotType of ALL_OUTPUT_SHOT_TYPES) {
        const stats = look.selectionStats.byView[shotType];
        if (stats && stats.total > 0) {
          totalShotTypes++;
          if (stats.isComplete) completeShotTypes++;
        }
      }
      // Count pending and failed outputs across all looks
      const allLookOutputs = Object.values(look.outputsByView).flat();
      pending += allLookOutputs.filter(o => o.status === 'queued' || o.status === 'running').length;
      failed += allLookOutputs.filter(o => o.status === 'failed').length;
    }
    
    return { 
      shotTypesStats: { total: totalShotTypes, complete: completeShotTypes },
      pendingCount: pending,
      failedCount: failed,
    };
  }, [groupedByLook]);
  const handleClearAllPending = useCallback(async () => {
    if (pendingCount === 0) {
      toast.info("No pending outputs to clear");
      return;
    }
    
    try {
      const { error, count } = await supabase
        .from("repose_outputs")
        .update({ status: "failed", error_message: "Cleared - stale queue" })
        .eq("batch_id", batchId)
        .in("status", ["queued", "running"]);
      
      if (error) throw error;
      
      // Force invalidate ALL repose-related queries to refresh UI
      await queryClient.invalidateQueries({ queryKey: ["repose-outputs"] });
      await queryClient.invalidateQueries({ queryKey: ["repose-batch-items"] });
      
      toast.success(`Cleared ${count || pendingCount} stale pending outputs`);
      refetchAll();
    } catch (error) {
      console.error("Clear pending error:", error);
      toast.error("Failed to clear pending outputs");
    }
  }, [batchId, pendingCount, refetchAll, queryClient]);

  // Scroll to look - simple DOM scrolling
  const scrollToLook = useCallback((lookId: string) => {
    const element = lookRefs.current.get(lookId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Build lightbox images for a specific look
  const getLightboxImages = useCallback((lookId: string): LightboxImage[] => {
    const look = groupedByLook.find(l => l.lookId === lookId);
    if (!look || !outputs) return [];

    const images: LightboxImage[] = [];
    
    for (const shotType of ALL_OUTPUT_SHOT_TYPES) {
      const viewOutputs = look.outputsByView[shotType] || [];
      for (const output of viewOutputs) {
        if (output.status === 'complete' && output.result_url) {
          images.push({
            id: output.id,
            url: output.result_url,
            shotType,
            output,
            lookCode: look.lookCode,
          });
        }
      }
    }

    return images;
  }, [groupedByLook, outputs]);

  // Open lightbox for specific output
  const openLightbox = useCallback((outputId: string, lookId: string) => {
    setCurrentLightboxLookId(lookId);
    const images = getLightboxImages(lookId);
    const index = images.findIndex(img => img.id === outputId);
    if (index !== -1) {
      setLightboxIndex(index);
      setLightboxOpen(true);
    }
  }, [getLightboxImages]);

  // Current lightbox images
  const lightboxImages = useMemo(() => {
    if (!currentLightboxLookId) return [];
    return getLightboxImages(currentLightboxLookId);
  }, [currentLightboxLookId, getLightboxImages]);

  // Lightbox toggle selection
  const handleLightboxToggle = useCallback((output: ReposeOutput) => {
    const batchItem = batchItems?.find(i => i.id === output.batch_item_id);
    if (!batchItem) return;

    const shotType = (output.shot_type || slotToShotType(output.slot || '') || 'FRONT_FULL') as OutputShotType;
    
    if (output.is_favorite) {
      setFavoriteRank.mutate({ outputId: output.id, rank: null });
    } else {
      const nextRank = getNextAvailableRank(batchItem.id, shotType);
      if (nextRank) {
        setFavoriteRank.mutate({ outputId: output.id, rank: nextRank });
      }
    }
  }, [batchItems, setFavoriteRank, getNextAvailableRank]);

  // Get next rank for lightbox
  const getLightboxNextRank = useCallback((output: ReposeOutput): 1 | 2 | 3 | null => {
    const batchItem = batchItems?.find(i => i.id === output.batch_item_id);
    if (!batchItem) return null;
    const shotType = (output.shot_type || slotToShotType(output.slot || '')) as OutputShotType;
    return getNextAvailableRank(batchItem.id, shotType);
  }, [batchItems, getNextAvailableRank]);

  // Handle output selection
  const handleSelectOutput = useCallback((output: ReposeOutput, rank: 1 | 2 | 3 | null) => {
    setFavoriteRank.mutate({ outputId: output.id, rank });
  }, [setFavoriteRank]);

  if (batchLoading || isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LeapfrogLoader />
      </div>
    );
  }

  if (!outputs?.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No outputs to review yet. Run generation first.</p>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-16rem)]">
      {/* Stats Header */}
      <Card className="mb-4">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs text-muted-foreground">Looks complete</p>
                <p className="text-lg font-bold">
                  <span className={cn(
                    overallStats.isAllComplete ? "text-primary" : ""
                  )}>
                    {overallStats.completedLooks}
                  </span>
                  <span className="text-muted-foreground font-normal"> / {overallStats.totalLooks}</span>
                </p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div>
                <p className="text-xs text-muted-foreground">Shot types complete</p>
                <p className="text-lg font-bold">
                  <span className={cn(
                    shotTypesStats.complete === shotTypesStats.total && shotTypesStats.total > 0 ? "text-primary" : ""
                  )}>
                    {shotTypesStats.complete}
                  </span>
                  <span className="text-muted-foreground font-normal"> / {shotTypesStats.total}</span>
                </p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div>
                <p className="text-xs text-muted-foreground">Selected</p>
                <p className="text-lg font-bold">{overallStats.totalFavorites}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Auto-resume toggle */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="auto-resume"
                        checked={autoResume.isEnabled}
                        onCheckedChange={autoResume.setEnabled}
                        disabled={autoResume.isAutoResuming}
                      />
                      <Label htmlFor="auto-resume" className="text-sm cursor-pointer flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5" />
                        Auto
                      </Label>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Auto-resume stalled queue every 30s</p>
                    {autoResume.nextRetryTime && (
                      <p className="text-xs text-muted-foreground">
                        Next retry: {formatDistanceToNow(autoResume.nextRetryTime, { addSuffix: true })}
                      </p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Auto-resuming indicator */}
              {autoResume.isAutoResuming && (
                <Badge variant="outline" className="gap-1.5 animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Resuming...
                </Badge>
              )}

              {/* Pending with backoff indicator */}
              {autoResume.pendingWithBackoff > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="secondary" className="gap-1.5">
                        <RefreshCw className="w-3 h-3" />
                        {autoResume.pendingWithBackoff} waiting
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{autoResume.pendingWithBackoff} items waiting for rate limit cooldown</p>
                      {autoResume.nextRetryTime && (
                        <p className="text-xs">Next: {formatDistanceToNow(autoResume.nextRetryTime, { addSuffix: true })}</p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {/* Resume buttons */}
              {(pendingCount > 0 || autoResume.readyCount > 0) && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={autoResume.resumeNow}
                  disabled={autoResume.isAutoResuming}
                  className="gap-1.5 text-green-600 border-green-300 hover:bg-green-50"
                >
                  <Play className="w-3.5 h-3.5" />
                  Resume {autoResume.readyCount || pendingCount}
                </Button>
              )}

              {failedCount > 0 && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={autoResume.resumeAllFailed}
                  disabled={autoResume.isAutoResuming}
                  className="gap-1.5 text-amber-600 border-amber-300 hover:bg-amber-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Retry {failedCount} Failed
                </Button>
              )}

              {pendingCount > 0 && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleClearAllPending}
                  className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear Stale
                </Button>
              )}

              {overallStats.isAllComplete && (
                <Badge variant="default" className="gap-1.5 bg-primary">
                  <Check className="w-3 h-3" />
                  Ready to Export
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Layout - Clear separation between sidebar and content */}
      <div className="flex h-[calc(100%-5rem)] border rounded-lg overflow-hidden bg-muted/30">
        {/* Left Sidebar - Fixed width, doesn't overlap */}
        <InfiniteSidebar
          looks={groupedByLook}
          onSelectLook={scrollToLook}
          overallStats={overallStats}
        />

        {/* Right Content Panel - Scrollable with proper padding */}
        <ScrollArea className="flex-1 bg-background">
          <div className="p-2 space-y-4">
            {groupedByLook.map((look) => (
              <div 
                key={look.lookId}
                ref={(el) => {
                  if (el) lookRefs.current.set(look.lookId, el);
                  else lookRefs.current.delete(look.lookId);
                }}
              >
                <InfiniteLookSection
                  look={look}
                  batchId={batchId!}
                  outputs={outputs}
                  onSelectOutput={handleSelectOutput}
                  onOpenLightbox={(outputId) => openLightbox(outputId, look.lookId)}
                  getNextAvailableRank={(shotType) => getNextAvailableRank(look.batchItemId, shotType)}
                  isViewFull={(shotType) => isViewFull(look.batchItemId, shotType)}
                  isViewSkipped={(shotType) => isViewSkipped(look.lookId, shotType)}
                  onSkipView={(shotType) => skipView.mutate({ lookId: look.lookId, shotType })}
                  onUndoSkipView={(shotType) => undoSkipView.mutate({ lookId: look.lookId, shotType })}
                  onRefresh={refetchAll}
                />
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Lightbox */}
      <CurationLightbox
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        images={lightboxImages}
        currentIndex={lightboxIndex}
        onNavigate={setLightboxIndex}
        onToggleSelection={handleLightboxToggle}
        getNextRank={getLightboxNextRank}
      />
    </div>
  );
}