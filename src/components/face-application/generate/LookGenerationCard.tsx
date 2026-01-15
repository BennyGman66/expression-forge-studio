import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Check, Clock, AlertCircle, Loader2, Sparkles } from "lucide-react";
import { LookGenerationStats, ViewOutputStats } from "@/hooks/useGenerationTracking";

interface LookGenerationCardProps {
  look: LookGenerationStats;
  requiredOptions: number;
  isSelected: boolean;
  onToggleSelect: (lookId: string) => void;
  disabled?: boolean;
}

function ViewStatusBadge({ 
  viewStat, 
  requiredOptions 
}: { 
  viewStat: ViewOutputStats; 
  requiredOptions: number;
}) {
  const { completedCount, failedCount, runningCount, pendingCount, isComplete, view, viewLabel } = viewStat;
  const hasActivity = runningCount > 0 || pendingCount > 0;
  const hasFailed = failedCount > 0;

  // Determine status icon
  let statusIcon: React.ReactNode = null;
  let statusColor = "bg-muted border-dashed border-muted-foreground/30";

  if (isComplete) {
    statusIcon = <Check className="w-3 h-3 text-white" />;
    statusColor = "bg-emerald-500";
  } else if (hasActivity) {
    statusIcon = <Loader2 className="w-3 h-3 text-white animate-spin" />;
    statusColor = "bg-blue-500";
  } else if (hasFailed && completedCount === 0) {
    statusIcon = <AlertCircle className="w-3 h-3 text-white" />;
    statusColor = "bg-red-500";
  } else if (completedCount > 0) {
    // Partial - has some but not complete
    statusIcon = <Clock className="w-3 h-3 text-white" />;
    statusColor = "bg-amber-500";
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className={cn(
        "w-5 h-5 rounded-full flex items-center justify-center border",
        statusColor
      )}>
        {statusIcon}
      </div>
      <span className="text-[10px] text-muted-foreground capitalize">
        {viewLabel}
      </span>
      <span className={cn(
        "text-[9px] font-medium",
        isComplete ? "text-emerald-600" : 
        completedCount > 0 ? "text-amber-600" : 
        "text-muted-foreground"
      )}>
        {completedCount}/{requiredOptions}
      </span>
    </div>
  );
}

export function LookGenerationCard({
  look,
  requiredOptions,
  isSelected,
  onToggleSelect,
  disabled = false,
}: LookGenerationCardProps) {
  const { 
    lookId, 
    lookName, 
    totalCompletedOutputs, 
    viewsComplete, 
    totalViews,
    isFullyComplete,
    needsGeneration,
    views,
    sourceImages,
    isNewSinceLastRun,
  } = look;

  return (
    <div 
      className={cn(
        "border rounded-lg p-3 transition-all",
        isSelected && "ring-2 ring-primary bg-primary/5",
        isFullyComplete && "bg-emerald-50/50 border-emerald-200",
        !isFullyComplete && !needsGeneration && "bg-muted/30"
      )}
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(lookId)}
          disabled={disabled}
          className="mt-0.5"
        />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{lookName}</span>
            
            {/* Status badges */}
            {isNewSinceLastRun && (
              <Badge variant="outline" className="h-5 text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                <Sparkles className="w-2.5 h-2.5 mr-1" />
                New
              </Badge>
            )}
          </div>
        </div>

        {/* Generation count badge */}
        <div className={cn(
          "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
          isFullyComplete 
            ? "bg-emerald-100 text-emerald-700" 
            : totalCompletedOutputs > 0 
              ? "bg-amber-100 text-amber-700"
              : "bg-muted text-muted-foreground"
        )}>
          {isFullyComplete ? (
            <>
              <Check className="w-3 h-3" />
              Generated {totalCompletedOutputs}
            </>
          ) : totalCompletedOutputs > 0 ? (
            <>
              <Clock className="w-3 h-3" />
              {viewsComplete}/{totalViews} views
            </>
          ) : (
            "Not generated"
          )}
        </div>
      </div>

      {/* Views row */}
      <div className="flex items-center gap-3 mt-3 pl-7">
        {views.map((viewStat) => {
          const sourceImage = sourceImages.find(s => s.view === viewStat.view);
          const imageUrl = sourceImage?.head_cropped_url || sourceImage?.source_url;

          return (
            <div key={viewStat.view} className="relative">
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt={viewStat.viewLabel}
                  className={cn(
                    "w-14 h-14 object-cover rounded border",
                    viewStat.isComplete && "border-emerald-400",
                    !viewStat.isComplete && viewStat.completedCount > 0 && "border-amber-400"
                  )}
                />
              )}
              {/* Overlay badge */}
              <div className="absolute -top-1 -right-1">
                <ViewStatusBadge viewStat={viewStat} requiredOptions={requiredOptions} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
