import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Check, Circle } from "lucide-react";
import type { LookWithOutputs } from "@/hooks/useReposeSelection";
import { ALL_OUTPUT_SHOT_TYPES, OUTPUT_SHOT_LABELS } from "@/types/shot-types";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface InfiniteSidebarProps {
  looks: LookWithOutputs[];
  onSelectLook: (lookId: string) => void;
  overallStats: {
    totalLooks: number;
    completedLooks: number;
    totalFavorites: number;
    isAllComplete: boolean;
  };
}

export function InfiniteSidebar({ 
  looks, 
  onSelectLook,
  overallStats 
}: InfiniteSidebarProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="w-64 border-r border-border flex flex-col bg-card">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold text-sm">Looks</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {overallStats.completedLooks} / {overallStats.totalLooks} complete
          </p>
        </div>

        {/* Look List */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {looks.map((look) => {
              const isComplete = look.selectionStats.isAllComplete;
              const inProgress = look.selectionStats.completedViews > 0 && !isComplete;

              // Get shot type dot statuses
              const shotTypeDots = ALL_OUTPUT_SHOT_TYPES.map(shotType => {
                const stats = look.selectionStats.byView[shotType];
                const hasOutputs = stats && stats.total > 0;
                const isViewComplete = stats?.isComplete || false;
                const selectedCount = stats?.selected || 0;
                
                return {
                  shotType,
                  hasOutputs,
                  isComplete: isViewComplete,
                  selected: selectedCount,
                };
              }).filter(d => d.hasOutputs);

              return (
                <button
                  key={look.lookId}
                  onClick={() => onSelectLook(look.lookId)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                    "hover:bg-primary/5"
                  )}
                >
                  {/* Status Indicator */}
                  <div className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0",
                    isComplete && "bg-primary text-primary-foreground",
                    inProgress && "bg-amber-500/20 text-amber-500 border border-amber-500/50",
                    !isComplete && !inProgress && "bg-muted text-muted-foreground"
                  )}>
                    {isComplete ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Circle className="w-2 h-2 fill-current" />
                    )}
                  </div>

                  {/* Look Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {look.lookCode}
                    </p>
                    
                    {/* Shot Type Dots */}
                    <div className="flex items-center gap-1.5 mt-1">
                      {shotTypeDots.map(dot => (
                        <Tooltip key={dot.shotType}>
                          <TooltipTrigger asChild>
                            <div 
                              className={cn(
                                "w-2 h-2 rounded-full transition-colors",
                                dot.isComplete 
                                  ? "bg-primary" 
                                  : dot.selected > 0 
                                    ? "bg-amber-500" 
                                    : "bg-muted-foreground/30"
                              )}
                            />
                          </TooltipTrigger>
                          <TooltipContent side="right" className="text-xs">
                            {OUTPUT_SHOT_LABELS[dot.shotType]}: {dot.selected}/3
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>

        {/* Footer Stats */}
        <div className="p-4 border-t border-border bg-secondary/30">
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{overallStats.totalFavorites}</span> images selected
          </div>
          {overallStats.isAllComplete && (
            <div className="mt-2 flex items-center gap-1.5 text-primary text-xs font-medium">
              <Check className="w-3 h-3" />
              Ready to export
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
