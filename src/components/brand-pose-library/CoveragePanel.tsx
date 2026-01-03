import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CoverageStats, Slot, Gender } from "@/hooks/useLibraryPoses";
import { LibraryStatus } from "@/hooks/useBrandLibraries";
import { CheckCircle2, AlertTriangle, Lock, Send } from "lucide-react";

interface CoveragePanelProps {
  coverage: CoverageStats;
  minPosesPerSlot: number;
  libraryStatus: LibraryStatus;
  onSubmitForReview: () => void;
  onLock: () => void;
  pendingCount: number;
  failedCount: number;
}

const SLOTS: Slot[] = ["A", "B", "C", "D"];
const GENDERS: Gender[] = ["women", "men"];

export function CoveragePanel({
  coverage,
  minPosesPerSlot,
  libraryStatus,
  onSubmitForReview,
  onLock,
  pendingCount,
  failedCount,
}: CoveragePanelProps) {
  const getTotalIncluded = () => {
    let total = 0;
    GENDERS.forEach((g) => {
      SLOTS.forEach((s) => {
        total += coverage[g][s].included;
      });
    });
    return total;
  };

  const checkAllSlotsReady = () => {
    for (const gender of GENDERS) {
      for (const slot of SLOTS) {
        if (coverage[gender][slot].included < minPosesPerSlot) {
          return false;
        }
      }
    }
    return true;
  };

  const allSlotsReady = checkAllSlotsReady();
  const noPending = pendingCount === 0;
  const noFailed = failedCount === 0;
  const canSubmitForReview = allSlotsReady && libraryStatus === "draft";
  const canLock = libraryStatus === "review";

  return (
    <Card className="mt-auto">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          Lock Readiness
          {allSlotsReady && noPending && noFailed ? (
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {/* Checklist */}
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            {allSlotsReady ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            )}
            <span>Min {minPosesPerSlot} poses per slot/gender</span>
          </div>
          <div className="flex items-center gap-2">
            {noPending ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            )}
            <span>No pending items ({pendingCount} remaining)</span>
          </div>
          <div className="flex items-center gap-2">
            {noFailed ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            )}
            <span>No failed items ({failedCount} remaining)</span>
          </div>
        </div>

        {/* Total progress */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span>Total Included</span>
            <span>{getTotalIncluded()}</span>
          </div>
          <Progress 
            value={(getTotalIncluded() / (minPosesPerSlot * 8)) * 100} 
            className="h-2"
          />
        </div>

        {/* Actions */}
        {libraryStatus === "draft" && (
          <Button 
            className="w-full" 
            disabled={!canSubmitForReview}
            onClick={onSubmitForReview}
          >
            <Send className="w-4 h-4 mr-2" />
            Submit for Review
          </Button>
        )}

        {libraryStatus === "review" && (
          <Button 
            className="w-full" 
            onClick={onLock}
          >
            <Lock className="w-4 h-4 mr-2" />
            Sign Off & Lock
          </Button>
        )}

        {libraryStatus === "locked" && (
          <div className="text-center text-sm text-muted-foreground py-2">
            <Lock className="w-4 h-4 inline mr-1" />
            Library is locked
          </div>
        )}
      </CardContent>
    </Card>
  );
}
