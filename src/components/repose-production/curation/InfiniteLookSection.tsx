import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { ALL_OUTPUT_SHOT_TYPES, OutputShotType } from "@/types/shot-types";
import type { ReposeOutput } from "@/types/repose";
import type { LookWithOutputs } from "@/hooks/useReposeSelection";
import { ShotTypeBlock } from "./ShotTypeBlock";
import { cn } from "@/lib/utils";

interface InfiniteLookSectionProps {
  look: LookWithOutputs;
  batchId: string;
  outputs: ReposeOutput[];
  onSelectOutput: (output: ReposeOutput, rank: 1 | 2 | 3 | null) => void;
  onOpenLightbox: (outputId: string) => void;
  getNextAvailableRank: (shotType: OutputShotType) => 1 | 2 | 3 | null;
  isViewFull: (shotType: OutputShotType) => boolean;
  onRefresh: () => void;
  measureElement: (el: HTMLElement | null) => void;
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
  measureElement,
}: InfiniteLookSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Re-measure when content changes
  useEffect(() => {
    if (containerRef.current) {
      measureElement(containerRef.current);
    }
  }, [look.selectionStats, measureElement]);

  // Get shot types that have outputs
  const activeShots = ALL_OUTPUT_SHOT_TYPES.filter(shotType => {
    const viewOutputs = look.outputsByView[shotType] || [];
    return viewOutputs.some(o => o.status === 'complete');
  });

  return (
    <div 
      ref={containerRef}
      className="p-6 border-b border-border"
    >
      {/* Look Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            {/* Source Preview */}
            {look.sourceUrl && (
              <div className="w-12 h-12 rounded-lg overflow-hidden bg-secondary flex-shrink-0">
                <img 
                  src={look.sourceUrl} 
                  alt="Source" 
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <h2 className="text-lg font-serif">{look.lookCode}</h2>
          </div>
          
          <Badge 
            variant={look.selectionStats.isAllComplete ? "default" : "outline"}
            className={cn(
              look.selectionStats.isAllComplete && "bg-primary"
            )}
          >
            {look.selectionStats.completedViews} / {look.selectionStats.totalViews} views complete
          </Badge>
        </div>
        
        <p className="text-sm text-muted-foreground ml-15">
          Select top 3 favorites for each view. Click to view larger.
        </p>
      </div>

      {/* Shot Type Blocks */}
      <div className="space-y-4">
        {activeShots.map((shotType) => {
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
        })}
      </div>
    </div>
  );
}
