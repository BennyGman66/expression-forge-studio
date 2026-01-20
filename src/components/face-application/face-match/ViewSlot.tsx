import { useDroppable } from "@dnd-kit/core";
import { X, Crop, Check, Image as ImageIcon, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LookSourceImage } from "@/types/face-application";
import { cn } from "@/lib/utils";

const VIEW_LABELS: Record<string, string> = {
  front: "Front",
  full_front: "Full Front",
  cropped_front: "Cropped Front",
  back: "Back",
  side: "Side",
  detail: "Detail",
};

interface ViewSlotProps {
  sourceImage: LookSourceImage;
  pairedFaceUrl: string | null;
  onClearPairing: () => void;
  onCropClick: () => void;
  onSkip?: () => void;
  onUnskip?: () => void;
  isOver?: boolean;
  isSkipped?: boolean;
}

export function ViewSlot({
  sourceImage,
  pairedFaceUrl,
  onClearPairing,
  onCropClick,
  onSkip,
  onUnskip,
  isOver,
  isSkipped = false,
}: ViewSlotProps) {
  const hasCrop = !!sourceImage.head_cropped_url;
  const viewLabel = VIEW_LABELS[sourceImage.view] || sourceImage.view;

  // Only enable drop target if the image has been cropped
  const { setNodeRef, isOver: isDragOver } = useDroppable({
    id: sourceImage.id,
    data: { sourceImage },
    disabled: !hasCrop,
  });

  const showDropIndicator = hasCrop && (isOver || isDragOver);
  const displayImageUrl = hasCrop ? sourceImage.head_cropped_url : sourceImage.source_url;

  // Skipped state - for ANY skipped image (cropped or not)
  if (isSkipped) {
    return (
      <div className="relative rounded-lg border-2 border-emerald-500/50 bg-emerald-50/50 p-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {viewLabel}
          </span>
          <div className="flex items-center gap-2">
            {onUnskip && (
              <button
                onClick={onUnskip}
                className="text-xs text-primary hover:text-primary/80 font-medium"
              >
                Unskip
              </button>
            )}
            <div className="flex items-center gap-1 text-emerald-600">
              <SkipForward className="h-3 w-3" />
              <span className="text-xs font-medium">Skipped</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex gap-3">
          <div className="relative">
            <img
              src={displayImageUrl}
              alt={viewLabel}
              className="w-20 h-20 object-cover rounded-lg opacity-50"
            />
          </div>

          {/* Arrow */}
          <div className="flex items-center opacity-30">
            <div className="w-6 h-px bg-muted-foreground/30" />
            <div className="w-0 h-0 border-t-4 border-b-4 border-l-6 border-transparent border-l-muted-foreground/30" />
          </div>

          {/* Skipped indicator */}
          <div className="w-20 h-20 rounded-lg border-2 border-emerald-500/50 bg-emerald-50 flex items-center justify-center">
            <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
              <Check className="h-3 w-3 text-white" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If not cropped, show "needs crop" state with smaller buttons
  if (!hasCrop) {
    return (
      <div className="relative rounded-lg border-2 border-dashed border-rose-300 bg-rose-50/50 p-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-rose-600 uppercase tracking-wide">
            {viewLabel} — Needs Crop
          </span>
        </div>

        {/* Content */}
        <div className="flex gap-3">
          {/* Show original source image as preview */}
          <div className="relative">
            <img
              src={sourceImage.source_url}
              alt={viewLabel}
              className="w-20 h-20 object-cover rounded-lg opacity-70"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
              <ImageIcon className="h-6 w-6 text-white" />
            </div>
          </div>

          {/* Arrow placeholder (greyed out) */}
          <div className="flex items-center opacity-30">
            <div className="w-6 h-px bg-muted-foreground/30" />
            <div className="w-0 h-0 border-t-4 border-b-4 border-l-6 border-transparent border-l-muted-foreground/30" />
          </div>

          {/* Empty slot (disabled) */}
          <div className="w-20 h-20 rounded-lg border-2 border-dashed border-rose-200 bg-rose-50 flex items-center justify-center">
            <span className="text-[10px] text-rose-400 text-center px-1">
              Crop first
            </span>
          </div>
        </div>

        {/* Action buttons - smaller, side by side */}
        <div className="flex gap-2 mt-3">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-7 text-xs"
            onClick={onCropClick}
          >
            <Crop className="h-3 w-3 mr-1" />
            Crop Now
          </Button>
          {onSkip && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-7 text-xs text-primary border-primary/50 hover:bg-primary/10"
              onClick={onSkip}
            >
              <SkipForward className="h-3 w-3 mr-1" />
              Skip Now
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Normal cropped state
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative rounded-lg border-2 p-3 transition-all",
        showDropIndicator && "border-primary bg-primary/5 scale-[1.02]",
        pairedFaceUrl && !showDropIndicator && "border-emerald-500/50 bg-emerald-50/50",
        !pairedFaceUrl && !showDropIndicator && "border-dashed border-muted-foreground/30"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {viewLabel}
        </span>
        <div className="flex items-center gap-1">
          {onSkip && (
            <button
              onClick={onSkip}
              className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-0.5"
            >
              <SkipForward className="h-3 w-3" />
              Skip
            </button>
          )}
          {pairedFaceUrl && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
              onClick={onClearPairing}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex gap-3">
        {/* Source image (cropped head) */}
        <div className="relative">
          <img
            src={`${sourceImage.head_cropped_url}?t=${Date.now()}`}
            alt={viewLabel}
            className="w-20 h-20 object-cover rounded-lg"
          />
        </div>

        {/* Arrow */}
        <div className="flex items-center">
          <div className="w-6 h-px bg-muted-foreground/30" />
          <div className="w-0 h-0 border-t-4 border-b-4 border-l-6 border-transparent border-l-muted-foreground/30" />
        </div>

        {/* Paired face or drop zone */}
        {pairedFaceUrl ? (
          <div className="relative">
            <img
              src={pairedFaceUrl}
              alt="Paired face"
              className="w-20 h-20 object-cover rounded-lg border-2 border-emerald-500"
            />
            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm">
              <Check className="h-3 w-3 text-white" />
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "w-20 h-20 rounded-lg border-2 border-dashed flex items-center justify-center transition-colors",
              showDropIndicator
                ? "border-primary bg-primary/10"
                : "border-muted-foreground/30 bg-muted/30"
            )}
          >
            <span className="text-[10px] text-muted-foreground text-center px-1">
              {showDropIndicator ? "Drop here" : "Drop face"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
