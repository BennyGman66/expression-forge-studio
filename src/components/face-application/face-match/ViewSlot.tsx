import { useDroppable } from "@dnd-kit/core";
import { Check, X, Crop, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LookSourceImage } from "@/types/face-application";
import { VIEW_LABELS } from "@/types/face-application";

interface ViewSlotProps {
  sourceImage: LookSourceImage;
  pairedFaceUrl: string | null;
  onClearPairing: () => void;
  onCropClick: () => void;
  isOver?: boolean;
}

export function ViewSlot({
  sourceImage,
  pairedFaceUrl,
  onClearPairing,
  onCropClick,
  isOver,
}: ViewSlotProps) {
  const hasCrop = !!sourceImage.head_cropped_url;
  const viewLabel = VIEW_LABELS[sourceImage.view] || sourceImage.view;

  const { setNodeRef, isOver: isDragOver } = useDroppable({
    id: sourceImage.id,
    data: { sourceImage },
  });

  const showDropIndicator = isOver || isDragOver;

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

      {/* Content */}
      <div className="flex gap-3">
        {/* Source image (cropped head) */}
        <div className="relative">
          {hasCrop ? (
            <img
              src={`${sourceImage.head_cropped_url}?t=${Date.now()}`}
              alt={viewLabel}
              className="w-20 h-20 object-cover rounded-lg"
            />
          ) : (
            <div className="w-20 h-20 rounded-lg bg-muted flex flex-col items-center justify-center gap-1">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              <span className="text-[10px] text-muted-foreground">No crop</span>
            </div>
          )}
        </div>

        {/* Arrow or paired face */}
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

      {/* Crop action if needed */}
      {!hasCrop && (
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-2 h-7 text-xs"
          onClick={onCropClick}
        >
          <Crop className="h-3 w-3 mr-1" />
          Crop Head
        </Button>
      )}
    </div>
  );
}
