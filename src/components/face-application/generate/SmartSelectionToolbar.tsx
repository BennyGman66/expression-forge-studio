import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Sparkles, AlertCircle, Clock, Eye, Check, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { FilterMode } from "./GenerationFilters";

interface SmartSelectionToolbarProps {
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onSelectNeedsGeneration: () => void;
  onSelectNew: () => void;
  onSelectFailed: () => void;
  selectedCount: number;
  totalCount: number;
  needsGenerationCount: number;
  newCount: number;
  failedCount: number;
  disabled?: boolean;
  // Filter props
  filterMode: FilterMode;
  onFilterChange: (mode: FilterMode) => void;
  filterCounts: {
    all: number;
    needsGeneration: number;
    new: number;
    complete: number;
    failed: number;
  };
}

export function SmartSelectionToolbar({
  onSelectAll,
  onDeselectAll,
  onSelectNeedsGeneration,
  onSelectNew,
  onSelectFailed,
  selectedCount,
  totalCount,
  needsGenerationCount,
  newCount,
  failedCount,
  disabled = false,
  filterMode,
  onFilterChange,
  filterCounts,
}: SmartSelectionToolbarProps) {
  const filters: { mode: FilterMode; label: string; icon: React.ReactNode; count: number }[] = [
    { mode: "needs_generation", label: "Needs Gen", icon: <Sparkles className="w-3 h-3" />, count: filterCounts.needsGeneration },
    { mode: "all", label: "All", icon: <Eye className="w-3 h-3" />, count: filterCounts.all },
    { mode: "new", label: "New", icon: <Filter className="w-3 h-3" />, count: filterCounts.new },
    { mode: "complete", label: "Complete", icon: <Check className="w-3 h-3" />, count: filterCounts.complete },
    { mode: "failed", label: "Failed", icon: <AlertCircle className="w-3 h-3" />, count: filterCounts.failed },
  ];

  return (
    <div className="space-y-2">
      {/* Filter tabs row */}
      <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg w-fit">
        {filters.map(({ mode, label, icon, count }) => (
          <Button
            key={mode}
            variant={filterMode === mode ? "default" : "ghost"}
            size="sm"
            className={cn(
              "h-8 text-xs gap-1.5 px-3",
              filterMode === mode && "shadow-sm",
              count === 0 && "opacity-50"
            )}
            onClick={() => onFilterChange(mode)}
            disabled={disabled || count === 0}
          >
            {icon}
            {label}
            <span className={cn(
              "ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium",
              filterMode === mode ? "bg-primary-foreground/20" : "bg-muted-foreground/20"
            )}>
              {count}
            </span>
          </Button>
        ))}
      </div>

      {/* Selection row */}
      <div className="flex items-center justify-between py-2 px-3 bg-muted/30 rounded-lg border">
        {/* Left: selection count */}
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          <span className="font-medium text-foreground">{selectedCount}</span> of {totalCount} selected
        </span>

        {/* Right: selection buttons */}
        <div className="flex items-center gap-1.5">
          {needsGenerationCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={onSelectNeedsGeneration}
              disabled={disabled}
            >
              <Sparkles className="w-3 h-3" />
              Select Needs Gen ({needsGenerationCount})
            </Button>
          )}

          {newCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={onSelectNew}
              disabled={disabled}
            >
              <Clock className="w-3 h-3" />
              Select New ({newCount})
            </Button>
          )}

          {failedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5 text-red-600 hover:text-red-700 border-red-200"
              onClick={onSelectFailed}
              disabled={disabled}
            >
              <AlertCircle className="w-3 h-3" />
              Select Failed ({failedCount})
            </Button>
          )}

          <div className="h-4 w-px bg-border mx-1" />

          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={onSelectAll}
            disabled={disabled || selectedCount === totalCount}
          >
            <CheckCircle2 className="w-3 h-3" />
            All
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={onDeselectAll}
            disabled={disabled || selectedCount === 0}
          >
            <XCircle className="w-3 h-3" />
            None
          </Button>
        </div>
      </div>
    </div>
  );
}
