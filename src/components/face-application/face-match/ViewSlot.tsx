import { useDroppable } from "@dnd-kit/core";
import { X, Crop, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LookSourceImage } from "@/types/face-application";
import { cn } from "@/lib/utils";

interface ViewSlotProps {
  sourceImage: LookSourceImage;
  pairedFaceUrl: string | null;
  onClearPairing: () => void;
  onCropClick: () => void;
  onSkip?: () => void;
  isOver?: boolean;
}

export function ViewSlot({
  sourceImage,
  pairedFaceUrl,
  onClearPairing,
  onCropClick,
  onSkip,
  isOver = false,
}: ViewSlotProps) {
  const { setNodeRef } = useDroppable({
    id: sourceImage.id,
    data: { sourceImageId: sourceImage.id },
    disabled: !sourceImage.head_cropped_url,
  });

  const needsCrop = !sourceImage.head_cropped_url;
  const viewLabel = sourceImage.view?.replace('_', ' ').toUpperCase() || 'UNKNOWN';

  // Needs crop state - subtle neutral treatment
  if (needsCrop) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {viewLabel}
          </span>
          <span className="text-xs text-muted-foreground/70">
            Needs crop
          </span>
        </div>
        
        <div className="aspect-[3/4] rounded-md overflow-hidden bg-muted/50 mb-3">
          <img
            src={sourceImage.source_url}
            alt={`${viewLabel} view`}
            className="w-full h-full object-cover opacity-60"
          />
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCropClick}
            className="flex-1 gap-1.5"
          >
            <Crop className="h-3.5 w-3.5" />
            Crop Now
          </Button>
          {onSkip && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSkip}
              className="text-muted-foreground hover:text-foreground"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Cropped state - ready for pairing
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg border p-3 transition-colors",
        pairedFaceUrl 
          ? "border-primary/30 bg-primary/5" 
          : isOver 
            ? "border-primary bg-primary/10" 
            : "border-border bg-card"
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {viewLabel}
        </span>
        {pairedFaceUrl ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearPairing}
            className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground/70">
            Drop face
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Cropped source image */}
        <div className="aspect-square rounded-md overflow-hidden bg-muted">
          <img
            src={sourceImage.head_cropped_url!}
            alt={`${viewLabel} cropped`}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Paired face or placeholder */}
        <div 
          className={cn(
            "aspect-square rounded-md overflow-hidden",
            pairedFaceUrl ? "bg-muted" : "bg-muted/50 border-2 border-dashed border-muted-foreground/20"
          )}
        >
          {pairedFaceUrl ? (
            <img
              src={pairedFaceUrl}
              alt="Paired face"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-xs text-muted-foreground/50">Face</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
