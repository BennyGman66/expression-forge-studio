import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, Download, Check } from "lucide-react";
import { useReposeBatch } from "@/hooks/useReposeBatches";
import { useReposeSelection } from "@/hooks/useReposeSelection";
import { LeapfrogLoader } from "@/components/ui/LeapfrogLoader";
import { LookSidebar, ViewGroup, CurationLightbox } from "./curation";
import { ALL_OUTPUT_SHOT_TYPES, OutputShotType, slotToShotType, OUTPUT_SHOT_LABELS } from "@/types/shot-types";
import type { ReposeOutput } from "@/types/repose";
import { cn } from "@/lib/utils";

interface ReviewCurationPanelProps {
  batchId: string | undefined;
  onExportReady?: () => void;
}

interface LightboxImage {
  id: string;
  url: string;
  shotType: OutputShotType;
  output: ReposeOutput;
}

export function ReviewCurationPanel({ batchId, onExportReady }: ReviewCurationPanelProps) {
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

  const [selectedLookId, setSelectedLookId] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Auto-select first look
  const currentLook = useMemo(() => {
    if (selectedLookId) {
      return groupedByLook.find(l => l.lookId === selectedLookId);
    }
    // Auto-select first look if none selected
    if (groupedByLook.length > 0 && !selectedLookId) {
      setSelectedLookId(groupedByLook[0].lookId);
      return groupedByLook[0];
    }
    return null;
  }, [groupedByLook, selectedLookId]);

  // Build lightbox images for current look
  const lightboxImages = useMemo<LightboxImage[]>(() => {
    if (!currentLook || !outputs) return [];

    const images: LightboxImage[] = [];
    
    for (const shotType of ALL_OUTPUT_SHOT_TYPES) {
      const viewOutputs = currentLook.outputsByView[shotType] || [];
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
  }, [currentLook, outputs]);

  // Handle output selection
  const handleSelectOutput = useCallback((output: ReposeOutput, rank: 1 | 2 | 3 | null) => {
    setFavoriteRank.mutate({ outputId: output.id, rank });
  }, [setFavoriteRank]);

  // Open lightbox
  const openLightbox = useCallback((outputId: string) => {
    const index = lightboxImages.findIndex(img => img.id === outputId);
    if (index !== -1) {
      setLightboxIndex(index);
      setLightboxOpen(true);
    }
  }, [lightboxImages]);

  // Lightbox toggle selection
  const handleLightboxToggle = useCallback((output: ReposeOutput) => {
    const batchItem = batchItems?.find(i => i.id === output.batch_item_id);
    if (!batchItem) return;

    const shotType = (output.shot_type || slotToShotType(output.slot || '') || 'FRONT_FULL') as OutputShotType;
    
    if (output.is_favorite) {
      // Deselect
      setFavoriteRank.mutate({ outputId: output.id, rank: null });
    } else {
      // Select with next rank
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
    const shotType = (output.shot_type || slotToShotType(output.slot || '') || 'FRONT_FULL') as OutputShotType;
    return getNextAvailableRank(batchItem.id, shotType);
  }, [batchItems, getNextAvailableRank]);

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
                <p className="text-xs text-muted-foreground">Looks</p>
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

      {/* Main Layout */}
      <div className="flex h-[calc(100%-5rem)] border rounded-lg overflow-hidden">
        {/* Sidebar */}
        <LookSidebar
          looks={groupedByLook}
          selectedLookId={selectedLookId}
          onSelectLook={setSelectedLookId}
          overallStats={overallStats}
        />

        {/* Main Content */}
        <div className="flex-1 overflow-hidden bg-background">
          {currentLook ? (
            <ScrollArea className="h-full">
              <div className="p-6">
                {/* Look Header */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-xl font-serif">{currentLook.lookCode}</h2>
                    <Badge 
                      variant={currentLook.selectionStats.isAllComplete ? "default" : "outline"}
                      className={cn(
                        currentLook.selectionStats.isAllComplete && "bg-primary"
                      )}
                    >
                      {currentLook.selectionStats.completedViews} / {currentLook.selectionStats.totalViews} views complete
                    </Badge>
                  </div>
                  
                  {/* Source Preview */}
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-secondary flex-shrink-0">
                      {currentLook.sourceUrl && (
                        <img 
                          src={currentLook.sourceUrl} 
                          alt="Source" 
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Select top 3 favorites for each view. Double-click to open lightbox.
                    </p>
                  </div>
                </div>

                {/* View Groups */}
                <div className="space-y-4">
                  {ALL_OUTPUT_SHOT_TYPES.map((shotType) => {
                    const viewOutputs = currentLook.outputsByView[shotType] || [];
                    const stats = currentLook.selectionStats.byView[shotType];
                    
                    if (!stats && viewOutputs.length === 0) return null;

                    return (
                      <ViewGroup
                        key={shotType}
                        shotType={shotType}
                        outputs={viewOutputs}
                        stats={stats || { selected: 0, total: 0, isComplete: false }}
                        batchItemId={currentLook.batchItemId}
                        onSelectOutput={handleSelectOutput}
                        onOpenLightbox={openLightbox}
                        getNextAvailableRank={() => getNextAvailableRank(currentLook.batchItemId, shotType)}
                        isViewFull={isViewFull(currentLook.batchItemId, shotType)}
                      />
                    );
                  })}
                </div>
              </div>
            </ScrollArea>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <p>Select a look from the sidebar</p>
            </div>
          )}
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
