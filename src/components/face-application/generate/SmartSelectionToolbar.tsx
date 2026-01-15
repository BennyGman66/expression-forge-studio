import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Sparkles, AlertCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

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
}: SmartSelectionToolbarProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {selectedCount} of {totalCount} looks selected
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* Smart select buttons */}
        {needsGenerationCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={onSelectNeedsGeneration}
            disabled={disabled}
          >
            <Sparkles className="w-3 h-3" />
            Select Needs Generation ({needsGenerationCount})
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
            className="h-7 text-xs gap-1.5 text-red-600 hover:text-red-700"
            onClick={onSelectFailed}
            disabled={disabled}
          >
            <AlertCircle className="w-3 h-3" />
            Select Failed ({failedCount})
          </Button>
        )}

        <div className="h-4 w-px bg-border mx-1" />

        {/* Standard select buttons */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={onSelectAll}
          disabled={disabled || selectedCount === totalCount}
        >
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Select All
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={onDeselectAll}
          disabled={disabled || selectedCount === 0}
        >
          <XCircle className="w-3 h-3 mr-1" />
          Deselect All
        </Button>
      </div>
    </div>
  );
}
