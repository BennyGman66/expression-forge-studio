import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Check } from "lucide-react";
import { useReposeBatch } from "@/hooks/useReposeBatches";
import { useReposeSelection, LookWithOutputs } from "@/hooks/useReposeSelection";
import { LeapfrogLoader } from "@/components/ui/LeapfrogLoader";
import { CurationLightbox } from "./CurationLightbox";
import { InfiniteLookSection } from "./InfiniteLookSection";
import { InfiniteSidebar } from "./InfiniteSidebar";
import { ALL_OUTPUT_SHOT_TYPES, OutputShotType, slotToShotType, OUTPUT_SHOT_LABELS } from "@/types/shot-types";
import type { ReposeOutput } from "@/types/repose";
import { cn } from "@/lib/utils";

interface InfiniteReviewPanelProps {
  batchId: string | undefined;
  onExportReady?: () => void;
}

interface LightboxImage {
  id: string;
  url: string;
  shotType: OutputShotType;
  output: ReposeOutput;
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
    refetchOutputs,
  } = useReposeSelection(batchId);

  const parentRef = useRef<HTMLDivElement>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [currentLightboxLookId, setCurrentLightboxLookId] = useState<string | null>(null);
  const lookRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Calculate shot types complete
  const shotTypesStats = useMemo(() => {
    let totalShotTypes = 0;
    let completeShotTypes = 0;
    
    for (const look of groupedByLook) {
      for (const shotType of ALL_OUTPUT_SHOT_TYPES) {
        const stats = look.selectionStats.byView[shotType];
        if (stats && stats.total > 0) {
          totalShotTypes++;
          if (stats.isComplete) completeShotTypes++;
        }
      }
    }
    
    return { total: totalShotTypes, complete: completeShotTypes };
  }, [groupedByLook]);

  // Virtualizer for looks
  const rowVirtualizer = useVirtualizer({
    count: groupedByLook.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback(() => 600, []), // Estimate height per look section
    overscan: 2,
    getItemKey: useCallback((index: number) => groupedByLook[index]?.lookId || index, [groupedByLook]),
  });

  // Scroll to look
  const scrollToLook = useCallback((lookId: string) => {
    const index = groupedByLook.findIndex(l => l.lookId === lookId);
    if (index !== -1) {
      rowVirtualizer.scrollToIndex(index, { align: 'start', behavior: 'smooth' });
    }
  }, [groupedByLook, rowVirtualizer]);

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

            {overallStats.isAllComplete && (
              <Badge variant="default" className="gap-1.5 bg-primary">
                <Check className="w-3 h-3" />
                Ready to Export
              </Badge>
            )}
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
        <div 
          ref={parentRef}
          className="flex-1 overflow-auto bg-background border-l border-border"
        >
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const look = groupedByLook[virtualRow.index];
              if (!look) return null;

              return (
                <div
                  key={virtualRow.key}
                  ref={(el) => {
                    if (el) lookRefs.current.set(look.lookId, el);
                  }}
                  data-index={virtualRow.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
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
                    onRefresh={refetchOutputs}
                    measureElement={(el) => rowVirtualizer.measureElement(el)}
                  />
                </div>
              );
            })}
          </div>
        </div>
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
