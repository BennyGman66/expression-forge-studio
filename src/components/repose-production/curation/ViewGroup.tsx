import { useState } from "react";
import { ChevronDown, ChevronRight, Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { OutputShotType, OUTPUT_SHOT_LABELS } from "@/types/shot-types";
import type { ReposeOutput } from "@/types/repose";
import { MAX_FAVORITES_PER_VIEW } from "@/types/repose";
import { OutputTile } from "./OutputTile";

interface ViewGroupProps {
  shotType: OutputShotType;
  outputs: ReposeOutput[];
  stats: { selected: number; total: number; isComplete: boolean };
  batchItemId: string;
  onSelectOutput: (output: ReposeOutput, rank: 1 | 2 | 3 | null) => void;
  onOpenLightbox: (outputId: string) => void;
  getNextAvailableRank: () => 1 | 2 | 3 | null;
  isViewFull: boolean;
}

export function ViewGroup({
  shotType,
  outputs,
  stats,
  batchItemId,
  onSelectOutput,
  onOpenLightbox,
  getNextAvailableRank,
  isViewFull,
}: ViewGroupProps) {
  const [isOpen, setIsOpen] = useState(true);
  
  const completedOutputs = outputs.filter(o => o.status === 'complete');
  const selectedOutputs = completedOutputs.filter(o => o.is_favorite).sort((a, b) => 
    (a.favorite_rank || 0) - (b.favorite_rank || 0)
  );

  // Status styling
  const getStatusStyle = () => {
    if (stats.isComplete) return { bg: "bg-primary/10", text: "text-primary", border: "border-primary/30" };
    if (stats.selected > 0) return { bg: "bg-amber-500/10", text: "text-amber-500", border: "border-amber-500/30" };
    return { bg: "bg-muted/50", text: "text-muted-foreground", border: "border-border" };
  };

  const statusStyle = getStatusStyle();

  const handleToggleSelection = (output: ReposeOutput) => {
    if (output.is_favorite) {
      // Deselect
      onSelectOutput(output, null);
    } else {
      // Select with next available rank
      const nextRank = getNextAvailableRank();
      if (nextRank) {
        onSelectOutput(output, nextRank);
      }
    }
  };

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
            <span className="font-medium">{OUTPUT_SHOT_LABELS[shotType]}</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Status Badge */}
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
          </div>
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="p-4 bg-background">
          {completedOutputs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No completed outputs for this view
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {completedOutputs.map((output) => (
                <OutputTile
                  key={output.id}
                  output={output}
                  onToggleSelection={() => handleToggleSelection(output)}
                  onOpenLightbox={() => onOpenLightbox(output.id)}
                  isViewFull={isViewFull && !output.is_favorite}
                />
              ))}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
