import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CurationStatus, OutputShotType, ALL_OUTPUT_SHOT_TYPES, OUTPUT_SHOT_LABELS } from "@/hooks/useLibraryPoses";
import { CheckCircle2, XCircle, Move, Trash2, X, RotateCcw } from "lucide-react";

interface BulkActionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBulkInclude: () => void;
  onBulkExclude: () => void;
  onBulkMove: (shotType: OutputShotType) => void;
  onBulkDelete: () => void;
  isLocked: boolean;
}

export function BulkActionBar({
  selectedCount,
  onClearSelection,
  onBulkInclude,
  onBulkExclude,
  onBulkMove,
  onBulkDelete,
  isLocked,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  // Short labels for buttons
  const SHORT_LABELS: Record<OutputShotType, string> = {
    FRONT_FULL: 'Front',
    FRONT_CROPPED: 'Crop',
    DETAIL: 'Detail',
    BACK_FULL: 'Back',
  };

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
      <div className="flex items-center gap-2 bg-card border rounded-lg shadow-lg px-4 py-2">
        <Badge variant="secondary" className="text-sm">
          {selectedCount} selected
        </Badge>

        <Button size="sm" variant="ghost" onClick={onClearSelection}>
          <X className="w-4 h-4 mr-1" />
          Clear
        </Button>

        <Separator orientation="vertical" className="h-6" />

        {!isLocked && (
          <>
            <Button size="sm" variant="outline" onClick={onBulkInclude}>
              <CheckCircle2 className="w-4 h-4 mr-1 text-green-600" />
              Include (I)
            </Button>

            <Button size="sm" variant="outline" onClick={onBulkExclude}>
              <XCircle className="w-4 h-4 mr-1 text-red-600" />
              Exclude (X)
            </Button>

            <Separator orientation="vertical" className="h-6" />

            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground mr-1">Move:</span>
              {ALL_OUTPUT_SHOT_TYPES.map((shotType) => (
                <Button
                  key={shotType}
                  size="sm"
                  variant="outline"
                  className="px-2"
                  onClick={() => onBulkMove(shotType)}
                  title={OUTPUT_SHOT_LABELS[shotType]}
                >
                  {SHORT_LABELS[shotType]}
                </Button>
              ))}
            </div>

            <Separator orientation="vertical" className="h-6" />

            <Button size="sm" variant="destructive" onClick={onBulkDelete}>
              <Trash2 className="w-4 h-4 mr-1" />
              Delete
            </Button>
          </>
        )}

        {isLocked && (
          <span className="text-sm text-muted-foreground">Library is locked</span>
        )}
      </div>
    </div>
  );
}
