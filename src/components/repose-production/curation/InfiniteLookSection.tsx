import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { ALL_OUTPUT_SHOT_TYPES, OutputShotType } from "@/types/shot-types";
import type { ReposeOutput } from "@/types/repose";
import type { LookWithOutputs } from "@/hooks/useReposeSelection";
import { ShotTypeBlock } from "./ShotTypeBlock";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

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

  const isComplete = look.selectionStats.isAllComplete;

  return (
    <div 
      ref={containerRef}
      className="p-4"
    >
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
                    src={look.sourceUrl} 
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
        </CardHeader>

        {/* Shot Type Blocks - Main Content */}
        <CardContent className="p-4 space-y-3">
          {activeShots.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No completed outputs yet
            </p>
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
    </div>
  );
}