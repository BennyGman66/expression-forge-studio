import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Check, Circle, ChevronRight } from "lucide-react";
import type { LookWithOutputs } from "@/hooks/useReposeSelection";
import { Badge } from "@/components/ui/badge";

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
    <div className="w-56 border-r border-border flex flex-col bg-card flex-shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h3 className="font-semibold text-sm">Looks</h3>
        <p className="text-xs text-muted-foreground mt-1">
          {overallStats.completedLooks} / {overallStats.totalLooks} complete
        </p>
      </div>

      {/* Look List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {looks.map((look) => {
            const isComplete = look.selectionStats.isAllComplete;
            const inProgress = look.selectionStats.completedViews > 0 && !isComplete;
            const viewsComplete = look.selectionStats.completedViews;
            const totalViews = look.selectionStats.totalViews;

            return (
              <button
                key={look.lookId}
                onClick={() => onSelectLook(look.lookId)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors group",
                  "hover:bg-secondary/80"
                )}
              >
                {/* Status Indicator */}
                <div className={cn(
                  "w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0",
                  isComplete && "bg-primary text-primary-foreground",
                  inProgress && "bg-amber-500/20 text-amber-500 border border-amber-500/50",
                  !isComplete && !inProgress && "bg-muted"
                )}>
                  {isComplete ? (
                    <Check className="w-2.5 h-2.5" />
                  ) : inProgress ? (
                    <Circle className="w-1.5 h-1.5 fill-current" />
                  ) : null}
                </div>

                {/* Look Code */}
                <span className="text-sm font-medium truncate flex-1">
                  {look.lookCode}
                </span>

                {/* Progress Badge */}
                <Badge 
                  variant="secondary" 
                  className={cn(
                    "text-[10px] px-1.5 py-0 h-4 font-normal",
                    isComplete && "bg-primary/10 text-primary",
                    inProgress && "bg-amber-500/10 text-amber-600"
                  )}
                >
                  {viewsComplete}/{totalViews}
                </Badge>

                <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
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
  );
}