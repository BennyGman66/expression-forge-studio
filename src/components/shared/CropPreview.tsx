import { cn } from "@/lib/utils";

interface CropPreviewProps {
  imageUrl: string;
  cropRect: { x: number; y: number; width: number; height: number };
  imageBounds: { offsetX: number; offsetY: number; width: number; height: number };
  className?: string;
}

export function CropPreview({ imageUrl, cropRect, imageBounds, className }: CropPreviewProps) {
  if (imageBounds.width === 0) return null;

  // Convert crop from container space to image-relative percentages
  const cropXInImage = cropRect.x - imageBounds.offsetX;
  const cropYInImage = cropRect.y - imageBounds.offsetY;

  const cropXPercent = (cropXInImage / imageBounds.width) * 100;
  const cropYPercent = (cropYInImage / imageBounds.height) * 100;
  const cropWidthPercent = (cropRect.width / imageBounds.width) * 100;

  // Calculate scale to fill the preview container
  const scale = 100 / cropWidthPercent;

  return (
    <div className={cn("w-full h-full overflow-hidden relative", className)}>
      <img
        src={imageUrl}
        alt=""
        className="absolute"
        style={{
          transformOrigin: 'top left',
          transform: `scale(${scale})`,
          left: `${-cropXPercent * scale}%`,
          top: `${-cropYPercent * scale}%`,
          width: '100%',
          height: 'auto',
        }}
      />
    </div>
  );
}
