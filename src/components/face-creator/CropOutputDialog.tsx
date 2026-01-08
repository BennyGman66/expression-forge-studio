import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, RotateCcw, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CropPreview } from "@/components/shared/CropPreview";
interface CropOutputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  outputId: string | null;
  imageUrl: string | null;
  onCropComplete: (outputId: string, newUrl: string) => void;
}

const OUTPUT_SIZE = 1000;

export function CropOutputDialog({
  open,
  onOpenChange,
  outputId,
  imageUrl,
  onCropComplete,
}: CropOutputDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  // Track actual rendered image position within container (accounts for object-contain)
  const [imageBounds, setImageBounds] = useState({ offsetX: 0, offsetY: 0, width: 0, height: 0 });
  // Crop box in CONTAINER pixel coordinates
  const [cropBox, setCropBox] = useState({ x: 0, y: 0, width: 200, height: 200 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeCorner, setResizeCorner] = useState<'nw' | 'ne' | 'sw' | 'se' | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [processing, setProcessing] = useState(false);

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setImageBounds({ offsetX: 0, offsetY: 0, width: 0, height: 0 });
      setImageDimensions({ width: 0, height: 0 });
    }
  }, [open, imageUrl]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const container = containerRef.current;
    if (!container) return;

    setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });

    // Calculate actual rendered image bounds with object-contain
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const containerAspect = containerWidth / containerHeight;

    let renderedWidth: number, renderedHeight: number, offsetX: number, offsetY: number;

    if (imgAspect > containerAspect) {
      // Image is wider than container - letterbox top/bottom
      renderedWidth = containerWidth;
      renderedHeight = containerWidth / imgAspect;
      offsetX = 0;
      offsetY = (containerHeight - renderedHeight) / 2;
    } else {
      // Image is taller than container - letterbox left/right
      renderedHeight = containerHeight;
      renderedWidth = containerHeight * imgAspect;
      offsetX = (containerWidth - renderedWidth) / 2;
      offsetY = 0;
    }

    setImageBounds({ offsetX, offsetY, width: renderedWidth, height: renderedHeight });

    // Set default 1:1 crop centered on image (60% of smaller dimension)
    const defaultSize = Math.min(renderedWidth, renderedHeight) * 0.6;
    setCropBox({
      x: offsetX + (renderedWidth - defaultSize) / 2,
      y: offsetY + (renderedHeight - defaultSize) / 2,
      width: defaultSize,
      height: defaultSize,
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current || imageBounds.width === 0) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if clicking inside crop box for dragging
    if (
      x >= cropBox.x &&
      x <= cropBox.x + cropBox.width &&
      y >= cropBox.y &&
      y <= cropBox.y + cropBox.height
    ) {
      setIsDragging(true);
      setDragStart({ x: x - cropBox.x, y: y - cropBox.y });
    }
  };

  const handleCornerMouseDown = (e: React.MouseEvent, corner: 'nw' | 'ne' | 'sw' | 'se') => {
    e.stopPropagation();
    if (imageBounds.width === 0) return;

    const rect = containerRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsResizing(true);
    setResizeCorner(corner);
    setDragStart({ x, y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current || imageBounds.width === 0) return;
    if (!isDragging && !isResizing) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isDragging) {
      let newX = x - dragStart.x;
      let newY = y - dragStart.y;

      // Constrain to image bounds (not container)
      newX = Math.max(imageBounds.offsetX, Math.min(newX, imageBounds.offsetX + imageBounds.width - cropBox.width));
      newY = Math.max(imageBounds.offsetY, Math.min(newY, imageBounds.offsetY + imageBounds.height - cropBox.height));

      setCropBox((prev) => ({ ...prev, x: newX, y: newY }));
    } else if (isResizing && resizeCorner) {
      const dx = x - dragStart.x;
      const dy = y - dragStart.y;

      // Use larger delta to maintain 1:1
      const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;

      let newCrop = { ...cropBox };

      switch (resizeCorner) {
        case 'se':
          newCrop.width = Math.max(50, cropBox.width + delta);
          newCrop.height = newCrop.width;
          break;
        case 'sw':
          const swNewWidth = Math.max(50, cropBox.width - delta);
          newCrop.x = cropBox.x + cropBox.width - swNewWidth;
          newCrop.width = swNewWidth;
          newCrop.height = swNewWidth;
          break;
        case 'ne':
          newCrop.width = Math.max(50, cropBox.width + delta);
          newCrop.height = newCrop.width;
          newCrop.y = cropBox.y + cropBox.height - newCrop.height;
          break;
        case 'nw':
          const nwNewWidth = Math.max(50, cropBox.width - delta);
          newCrop.x = cropBox.x + cropBox.width - nwNewWidth;
          newCrop.y = cropBox.y + cropBox.height - nwNewWidth;
          newCrop.width = nwNewWidth;
          newCrop.height = nwNewWidth;
          break;
      }

      // Constrain to image bounds
      if (newCrop.x < imageBounds.offsetX) {
        const overflow = imageBounds.offsetX - newCrop.x;
        newCrop.x = imageBounds.offsetX;
        newCrop.width -= overflow;
        newCrop.height = newCrop.width;
      }
      if (newCrop.y < imageBounds.offsetY) {
        const overflow = imageBounds.offsetY - newCrop.y;
        newCrop.y = imageBounds.offsetY;
        newCrop.height -= overflow;
        newCrop.width = newCrop.height;
      }
      if (newCrop.x + newCrop.width > imageBounds.offsetX + imageBounds.width) {
        newCrop.width = imageBounds.offsetX + imageBounds.width - newCrop.x;
        newCrop.height = newCrop.width;
      }
      if (newCrop.y + newCrop.height > imageBounds.offsetY + imageBounds.height) {
        newCrop.height = imageBounds.offsetY + imageBounds.height - newCrop.y;
        newCrop.width = newCrop.height;
      }

      setCropBox(newCrop);
      setDragStart({ x, y });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsResizing(false);
    setResizeCorner(null);
  };

  const handleApplyCrop = async () => {
    if (!outputId || !imageUrl || imageBounds.width === 0) return;
    setProcessing(true);

    try {
      // Convert from container pixels to image percentages
      const cropXPercent = ((cropBox.x - imageBounds.offsetX) / imageBounds.width) * 100;
      const cropYPercent = ((cropBox.y - imageBounds.offsetY) / imageBounds.height) * 100;
      const cropWidthPercent = (cropBox.width / imageBounds.width) * 100;
      const cropHeightPercent = (cropBox.height / imageBounds.height) * 100;

      console.log("Applying crop:", { cropXPercent, cropYPercent, cropWidthPercent, cropHeightPercent });

      const response = await supabase.functions.invoke("crop-and-store-image", {
        body: {
          imageUrl: imageUrl,
          cropX: cropXPercent,
          cropY: cropYPercent,
          cropWidth: cropWidthPercent,
          cropHeight: cropHeightPercent,
          targetSize: OUTPUT_SIZE,
          cropId: `output-crop-${outputId}-${Date.now()}`,
        },
      });

      if (response.error) throw response.error;

      const { croppedUrl } = response.data;
      const cacheBustedUrl = `${croppedUrl}?t=${Date.now()}`;

      await supabase
        .from("face_pairing_outputs")
        .update({ stored_url: cacheBustedUrl })
        .eq("id", outputId);

      toast.success("Image cropped successfully");
      onCropComplete(outputId, cacheBustedUrl);
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error cropping:", error);
      toast.error(error.message || "Failed to crop image");
    } finally {
      setProcessing(false);
    }
  };

  const handleReset = () => {
    if (imageBounds.width === 0) return;
    const defaultSize = Math.min(imageBounds.width, imageBounds.height) * 0.6;
    setCropBox({
      x: imageBounds.offsetX + (imageBounds.width - defaultSize) / 2,
      y: imageBounds.offsetY + (imageBounds.height - defaultSize) / 2,
      width: defaultSize,
      height: defaultSize,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Crop / Edit Image</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {imageUrl ? (
            <>
              <div
                ref={containerRef}
                className="relative bg-muted rounded-lg overflow-hidden select-none cursor-crosshair h-[60vh]"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <img
                  src={imageUrl}
                  alt="Edit"
                  className="w-full h-full object-contain"
                  onLoad={handleImageLoad}
                  draggable={false}
                />

                {/* Dark overlay - 4 regions outside crop */}
                {imageBounds.width > 0 && (
                  <>
                    <div
                      className="absolute left-0 right-0 top-0 bg-black/50 pointer-events-none"
                      style={{ height: cropBox.y }}
                    />
                    <div
                      className="absolute left-0 right-0 bg-black/50 pointer-events-none"
                      style={{ top: cropBox.y + cropBox.height, bottom: 0 }}
                    />
                    <div
                      className="absolute left-0 bg-black/50 pointer-events-none"
                      style={{ top: cropBox.y, width: cropBox.x, height: cropBox.height }}
                    />
                    <div
                      className="absolute bg-black/50 pointer-events-none"
                      style={{
                        top: cropBox.y,
                        left: cropBox.x + cropBox.width,
                        right: 0,
                        height: cropBox.height,
                      }}
                    />
                  </>
                )}

                {/* Crop box - already in container pixels */}
                {imageBounds.width > 0 && (
                  <div
                    className="absolute border-2 border-green-500 cursor-move"
                    style={{
                      left: cropBox.x,
                      top: cropBox.y,
                      width: cropBox.width,
                      height: cropBox.height,
                    }}
                  >
                    <div className="absolute top-1 left-1 text-xs bg-green-500 text-white px-1 rounded">
                      1:1
                    </div>
                    {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                      <div
                        key={corner}
                        className="absolute w-3 h-3 bg-green-500 border border-white rounded-full cursor-nwse-resize"
                        style={{
                          top: corner.includes('n') ? -6 : undefined,
                          bottom: corner.includes('s') ? -6 : undefined,
                          left: corner.includes('w') ? -6 : undefined,
                          right: corner.includes('e') ? -6 : undefined,
                        }}
                        onMouseDown={(e) => handleCornerMouseDown(e, corner)}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  Drag to move, use corners to resize. Output: {OUTPUT_SIZE}×{OUTPUT_SIZE}px
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleReset} disabled={processing}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset
                  </Button>
                  <Button onClick={handleApplyCrop} disabled={processing}>
                    {processing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Apply Crop
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Preview */}
              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-2">Preview:</p>
                <div className="w-32 h-32 overflow-hidden rounded border bg-muted">
                  <CropPreview
                    imageUrl={imageUrl}
                    cropRect={cropBox}
                    imageBounds={imageBounds}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              No image selected
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
