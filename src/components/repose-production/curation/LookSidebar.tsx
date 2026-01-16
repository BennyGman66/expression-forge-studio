import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Check, Circle } from "lucide-react";
import type { LookWithOutputs } from "@/hooks/useReposeSelection";

interface LookSidebarProps {
  looks: LookWithOutputs[];
  selectedLookId: string | null;
  onSelectLook: (lookId: string) => void;
  overallStats: {
    totalLooks: number;
    completedLooks: number;
    totalFavorites: number;
    isAllComplete: boolean;
  };
}

export function LookSidebar({ 
  looks, 
  selectedLookId, 
  onSelectLook,
  overallStats 
}: LookSidebarProps) {
  return (
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
            const isSelected = look.lookId === selectedLookId;
            const isComplete = look.selectionStats.isAllComplete;
            const inProgress = look.selectionStats.completedViews > 0 && !isComplete;

            return (
              <button
                key={look.lookId}
                onClick={() => onSelectLook(look.lookId)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                  isSelected 
                    ? "bg-primary/10 text-primary" 
                    : "hover:bg-secondary/50"
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
                  <p className="text-xs text-muted-foreground">
                    {look.selectionStats.completedViews}/{look.selectionStats.totalViews} views
                  </p>
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
  );
}
