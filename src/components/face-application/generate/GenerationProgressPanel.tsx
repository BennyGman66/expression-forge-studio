import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { XCircle, CheckCircle, AlertCircle, Clock, RefreshCw } from "lucide-react";
import { LeapfrogLoader } from "@/components/ui/LeapfrogLoader";
import { cn } from "@/lib/utils";

interface GenerationProgressPanelProps {
  isGenerating: boolean;
  progress: number;
  total: number;
  completedCount: number;
  failedCount: number;
  pendingCount: number;
  runningCount: number;
  elapsedTime: string;
  lastActivitySeconds: number | null;
  currentProcessingInfo: string;
  onCancel: () => void;
  onRetryFailed?: () => void;
  setupPhase?: boolean;
  setupProgress?: { current: number; total: number };
}

export function GenerationProgressPanel({
  isGenerating,
  progress,
  total,
  completedCount,
  failedCount,
  pendingCount,
  runningCount,
  elapsedTime,
  lastActivitySeconds,
  currentProcessingInfo,
  onCancel,
  onRetryFailed,
  setupPhase = false,
  setupProgress = { current: 0, total: 0 },
}: GenerationProgressPanelProps) {
  const overallProgress = total > 0 ? (progress / total) * 100 : 0;

  const getActivityStatusColor = () => {
    if (lastActivitySeconds === null) return "bg-muted";
    if (lastActivitySeconds < 30) return "bg-green-500";
    if (lastActivitySeconds < 60) return "bg-yellow-500";
    return "bg-red-500";
  };

  if (!isGenerating && failedCount === 0) return null;

  return (
    <div className="space-y-3 p-4 bg-muted/30 rounded-lg border">
      {isGenerating && (
        <>
          <div className="flex items-center gap-4">
            <LeapfrogLoader message="" size="sm" />
            <div className="flex-1">
              <div className="flex justify-between text-sm mb-1">
                <span>
                  {setupPhase 
                    ? `Setting up job ${setupProgress.current} of ${setupProgress.total}...` 
                    : "Generating faces..."}
                </span>
                <span className="font-medium">
                  {setupPhase 
                    ? `${setupProgress.current} / ${setupProgress.total} jobs`
                    : `${progress} / ${total}`}
                </span>
              </div>
              <Progress 
                value={setupPhase 
                  ? (setupProgress.total > 0 ? (setupProgress.current / setupProgress.total) * 100 : 0)
                  : overallProgress
                } 
                className="h-2" 
              />
            </div>
            <Button 
              variant="destructive" 
              size="sm"
              onClick={onCancel}
            >
              <XCircle className="w-4 h-4 mr-2" />
              Cancel
            </Button>
          </div>
          
          {/* Activity indicators */}
          {!setupPhase && (
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
              <span className="text-foreground/80">
                Processing: {currentProcessingInfo}
              </span>
              <div className="flex items-center gap-3">
                {elapsedTime && (
                  <span>Elapsed: {elapsedTime}</span>
                )}
                {lastActivitySeconds !== null && (
                  <span className="flex items-center gap-1.5">
                    Last activity: {lastActivitySeconds}s ago
                    <span className={`w-2 h-2 rounded-full ${getActivityStatusColor()} animate-pulse`} />
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}
      
      {/* Live output counts */}
      <div className={cn(
        "flex items-center gap-4 text-xs",
        isGenerating && "pt-2 border-t border-border/50"
      )}>
        {completedCount > 0 && (
          <span className="flex items-center gap-1 text-green-600">
            <CheckCircle className="w-3 h-3" />
            {completedCount} done
          </span>
        )}
        {failedCount > 0 && (
          <span className="flex items-center gap-1 text-red-500">
            <AlertCircle className="w-3 h-3" />
            {failedCount} failed
          </span>
        )}
        {(pendingCount + runningCount) > 0 && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Clock className="w-3 h-3" />
            {pendingCount + runningCount} remaining
          </span>
        )}

        {/* Retry failed button when not generating */}
        {!isGenerating && failedCount > 0 && onRetryFailed && (
          <Button 
            size="sm" 
            variant="outline"
            className="ml-auto h-7"
            onClick={onRetryFailed}
          >
            <RefreshCw className="w-3 h-3 mr-1.5" />
            Retry Failed ({failedCount})
          </Button>
        )}
      </div>
    </div>
  );
}
