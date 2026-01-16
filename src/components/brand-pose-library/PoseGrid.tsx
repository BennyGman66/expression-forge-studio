import { useCallback, useRef, useEffect } from "react";
import { LibraryPose, CurationStatus, OutputShotType, OUTPUT_SHOT_LABELS } from "@/hooks/useLibraryPoses";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, XCircle, Eye, Move, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PoseGridProps {
  poses: LibraryPose[];
  selectedIds: Set<string>;
  onSelectPose: (id: string, shiftKey: boolean) => void;
  onToggleSelect: (id: string) => void;
  onInspect: (pose: LibraryPose) => void;
  onQuickInclude: (id: string) => void;
  onQuickExclude: (id: string) => void;
  isLocked: boolean;
}

const STATUS_COLORS: Record<CurationStatus, string> = {
  pending: "bg-amber-500",
  included: "bg-green-500",
  excluded: "bg-red-500",
  failed: "bg-gray-500",
};

// Short labels for badges
const SHORT_LABELS: Record<OutputShotType, string> = {
  FRONT_FULL: 'Front',
  FRONT_CROPPED: 'Crop',
  DETAIL: 'Detail',
  BACK_FULL: 'Back',
};

export function PoseGrid({
  poses,
  selectedIds,
  onSelectPose,
  onToggleSelect,
  onInspect,
  onQuickInclude,
  onQuickExclude,
  isLocked,
}: PoseGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  if (poses.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p>No poses match the current filters</p>
      </div>
    );
  }

  return (
    <div
      ref={gridRef}
      className="flex-1 overflow-y-auto p-4"
      tabIndex={0}
    >
      <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2">
        {poses.map((pose) => {
          const isSelected = selectedIds.has(pose.id);
          return (
            <div
              key={pose.id}
              className={cn(
                "group relative aspect-[3/4] rounded-lg overflow-hidden cursor-pointer border-2 transition-all",
                isSelected ? "border-primary ring-2 ring-primary/30" : "border-transparent hover:border-muted-foreground/30"
              )}
              onClick={(e) => onSelectPose(pose.id, e.shiftKey)}
            >
              {/* Image */}
              <img
                src={pose.clay_image_url || "/placeholder.svg"}
                alt={`Pose ${OUTPUT_SHOT_LABELS[pose.shotType]}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />

              {/* Selection checkbox */}
              <div
                className="absolute top-1 left-1 z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect(pose.id);
                }}
              >
                <Checkbox checked={isSelected} className="bg-background/80" />
              </div>

              {/* Status indicator */}
              <div
                className={cn(
                  "absolute top-1 right-1 w-3 h-3 rounded-full",
                  STATUS_COLORS[pose.curation_status]
                )}
                title={pose.curation_status}
              />

              {/* Shot type badge + crop target indicator */}
              <div className="absolute bottom-1 left-1 flex items-center gap-0.5">
                <Badge
                  variant="secondary"
                  className="text-xs px-1.5 py-0"
                  title={OUTPUT_SHOT_LABELS[pose.shotType]}
                >
                  {SHORT_LABELS[pose.shotType]}
                </Badge>
                {/* Show crop target for FRONT_CROPPED poses */}
                {pose.shotType === 'FRONT_CROPPED' && pose.crop_target && (
                  <Badge
                    variant="outline"
                    className="text-xs px-1 py-0 bg-background/80"
                    title={`Crop target: ${pose.crop_target}`}
                  >
                    {pose.crop_target === 'top' ? '👕' : '👖'}
                  </Badge>
                )}
              </div>

              {/* Gender badge */}
              {pose.gender && (
                <Badge
                  variant="outline"
                  className="absolute bottom-1 right-1 text-xs px-1.5 py-0 bg-background/80"
                >
                  {pose.gender === "women" ? "W" : "M"}
                </Badge>
              )}

              {/* Hover actions */}
              {!isLocked && (
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuickInclude(pose.id);
                    }}
                    title="Include (I)"
                  >
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuickExclude(pose.id);
                    }}
                    title="Exclude (X)"
                  >
                    <XCircle className="w-4 h-4 text-red-600" />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      onInspect(pose);
                    }}
                    title="Inspect"
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
