import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowUpFromLine } from "lucide-react";
import { LookSourceImage } from "@/types/face-application";

interface InlineCropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceImage: LookSourceImage;
  onCropComplete: (updatedImage: LookSourceImage) => void;
}

const OUTPUT_SIZE = 1000;

export function InlineCropDialog({
  open,
  onOpenChange,
  sourceImage,
  onCropComplete,
}: InlineCropDialogProps) {
  const [cropBox, setCropBox] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeCorner, setResizeCorner] = useState<'nw' | 'ne' | 'sw' | 'se' | null>(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, cropX: 0, cropY: 0, cropWidth: 0, cropHeight: 0 });
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [cachedBounds, setCachedBounds] = useState<{
    offsetX: number;
    offsetY: number;
    renderedWidth: number;
    renderedHeight: number;
    scaleX: number;
    scaleY: number;
  } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [expanding, setExpanding] = useState(false);
  const [currentSourceUrl, setCurrentSourceUrl] = useState<string>("");
  const [forceDefaultCrop, setForceDefaultCrop] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const { toast } = useToast();

  // Reset state when dialog opens
  useEffect(() => {
    if (open && sourceImage) {
      setCropBox({ x: 0, y: 0, width: 0, height: 0 });
      setImageDimensions({ width: 0, height: 0 });
      setCachedBounds(null);
      setCurrentSourceUrl(sourceImage.source_url);
      setForceDefaultCrop(false);
    }
  }, [open, sourceImage?.id]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const newDimensions = { width: img.naturalWidth, height: img.naturalHeight };
    setImageDimensions(newDimensions);

    const rect = img.getBoundingClientRect();
    const containerAspect = rect.width / rect.height;
    const imageAspect = newDimensions.width / newDimensions.height;

    let renderedWidth: number, renderedHeight: number, offsetX: number, offsetY: number;

    if (imageAspect > containerAspect) {
      renderedWidth = rect.width;
      renderedHeight = rect.width / imageAspect;
      offsetX = 0;
      offsetY = (rect.height - renderedHeight) / 2;
    } else {
      renderedHeight = rect.height;
      renderedWidth = rect.height * imageAspect;
      offsetX = (rect.width - renderedWidth) / 2;
      offsetY = 0;
    }

    const bounds = {
      offsetX,
      offsetY,
      renderedWidth,
      renderedHeight,
      scaleX: newDimensions.width / renderedWidth,
      scaleY: newDimensions.height / renderedHeight,
    };
    setCachedBounds(bounds);

    // If forceDefaultCrop is set (after expansion), use defaults
    const shouldUseDefault = forceDefaultCrop || 
      sourceImage?.head_crop_x === null || 
      sourceImage?.head_crop_x === undefined;

    if (shouldUseDefault) {
      // Default crop to top-center
      const defaultWidth = Math.min(newDimensions.width * 0.4, 400);
      setCropBox({
        x: (newDimensions.width - defaultWidth) / 2,
        y: 20,
        width: defaultWidth,
        height: defaultWidth,
      });
      setForceDefaultCrop(false);
    } else {
      // Use saved crop data
      setCropBox({
        x: sourceImage.head_crop_x || 0,
        y: sourceImage.head_crop_y || 0,
        width: sourceImage.head_crop_width || 200,
        height: sourceImage.head_crop_height || 200,
      });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imageRef.current || !cachedBounds) return;

    const rect = imageRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - cachedBounds.offsetX) * cachedBounds.scaleX;
    const y = (e.clientY - rect.top - cachedBounds.offsetY) * cachedBounds.scaleY;

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
    if (!imageRef.current || !cachedBounds) return;

    const rect = imageRef.current.getBoundingClientRect();
    setIsResizing(true);
    setResizeCorner(corner);
    setResizeStart({
      x: (e.clientX - rect.left - cachedBounds.offsetX) * cachedBounds.scaleX,
      y: (e.clientY - rect.top - cachedBounds.offsetY) * cachedBounds.scaleY,
      cropX: cropBox.x,
      cropY: cropBox.y,
      cropWidth: cropBox.width,
      cropHeight: cropBox.height,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!imageRef.current || !cachedBounds) return;

    const rect = imageRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - cachedBounds.offsetX) * cachedBounds.scaleX;
    const y = (e.clientY - rect.top - cachedBounds.offsetY) * cachedBounds.scaleY;

    if (isResizing && resizeCorner) {
      const deltaX = x - resizeStart.x;
      const deltaY = y - resizeStart.y;

      let newX = resizeStart.cropX;
      let newY = resizeStart.cropY;
      let newSize = resizeStart.cropWidth;
      const delta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;

      switch (resizeCorner) {
        case 'se':
          newSize = Math.max(50, resizeStart.cropWidth + delta);
          break;
        case 'sw':
          newSize = Math.max(50, resizeStart.cropWidth - delta);
          newX = resizeStart.cropX + resizeStart.cropWidth - newSize;
          break;
        case 'ne':
          newSize = Math.max(50, resizeStart.cropWidth + delta);
          newY = resizeStart.cropY + resizeStart.cropHeight - newSize;
          break;
        case 'nw':
          newSize = Math.max(50, resizeStart.cropWidth - delta);
          newX = resizeStart.cropX + resizeStart.cropWidth - newSize;
          newY = resizeStart.cropY + resizeStart.cropHeight - newSize;
          break;
      }

      newX = Math.max(0, newX);
      newY = Math.max(0, newY);
      newSize = Math.min(newSize, imageDimensions.width - newX, imageDimensions.height - newY);

      setCropBox({ x: newX, y: newY, width: newSize, height: newSize });
      return;
    }

    if (isDragging) {
      let newX = x - dragStart.x;
      let newY = y - dragStart.y;

      newX = Math.max(0, Math.min(newX, imageDimensions.width - cropBox.width));
      newY = Math.max(0, Math.min(newY, imageDimensions.height - cropBox.height));

      setCropBox((prev) => ({ ...prev, x: newX, y: newY }));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsResizing(false);
    setResizeCorner(null);
  };

  const handleExpandImage = async () => {
    if (!sourceImage) return;
    setExpanding(true);

    try {
      const response = await supabase.functions.invoke("expand-image-top", {
        body: {
          imageUrl: currentSourceUrl,
          imageId: sourceImage.id,
          paddingPercent: 20,
        },
      });

      if (response.error) throw response.error;

      const { expandedUrl } = response.data;

      // Update database - expanded image becomes new source, clear crop data
      await supabase
        .from("look_source_images")
        .update({
          source_url: expandedUrl,
          head_crop_x: null,
          head_crop_y: null,
          head_crop_width: null,
          head_crop_height: null,
          head_cropped_url: null,
        })
        .eq("id", sourceImage.id);

      // Set flag to force default crop on new image
      setForceDefaultCrop(true);
      
      // Update local source URL with cache bust
      setCurrentSourceUrl(`${expandedUrl}?t=${Date.now()}`);
      
      // Reset crop box (will be recalculated on image load)
      setCropBox({ x: 0, y: 0, width: 0, height: 0 });
      setCachedBounds(null);
      setImageDimensions({ width: 0, height: 0 });

      toast({
        title: "Image expanded",
        description: "Added 20% white space to top. Please reposition the crop box.",
      });
    } catch (error: any) {
      toast({ title: "Error expanding image", description: error.message, variant: "destructive" });
    } finally {
      setExpanding(false);
    }
  };

  const handleApplyCrop = async () => {
    if (!imageDimensions.width || !imageDimensions.height) return;
    setProcessing(true);

    try {
      const response = await supabase.functions.invoke("crop-and-store-image", {
        body: {
          imageUrl: currentSourceUrl,
          cropX: (cropBox.x / imageDimensions.width) * 100,
          cropY: (cropBox.y / imageDimensions.height) * 100,
          cropWidth: (cropBox.width / imageDimensions.width) * 100,
          cropHeight: (cropBox.height / imageDimensions.height) * 100,
          targetSize: OUTPUT_SIZE,
          cropId: `look-head-${sourceImage.id}`,
        },
      });

      if (response.error) throw response.error;

      const { croppedUrl } = response.data;

      await supabase
        .from("look_source_images")
        .update({
          source_url: currentSourceUrl.split('?')[0], // Store clean URL without cache bust
          head_crop_x: Math.round(cropBox.x),
          head_crop_y: Math.round(cropBox.y),
          head_crop_width: Math.round(cropBox.width),
          head_crop_height: Math.round(cropBox.height),
          head_cropped_url: croppedUrl,
        })
        .eq("id", sourceImage.id);

      const updatedImage: LookSourceImage = {
        ...sourceImage,
        source_url: currentSourceUrl.split('?')[0],
        head_crop_x: Math.round(cropBox.x),
        head_crop_y: Math.round(cropBox.y),
        head_crop_width: Math.round(cropBox.width),
        head_crop_height: Math.round(cropBox.height),
        head_cropped_url: `${croppedUrl}?t=${Date.now()}`,
      };

      toast({ title: "Crop applied", description: `${sourceImage.view} head cropped successfully.` });
      onCropComplete(updatedImage);
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  // Calculate crop box position for overlay
  const getCropOverlayStyle = () => {
    if (!cachedBounds || !cropBox.width) return { display: 'none' };

    return {
      left: `${cachedBounds.offsetX + cropBox.x / cachedBounds.scaleX}px`,
      top: `${cachedBounds.offsetY + cropBox.y / cachedBounds.scaleY}px`,
      width: `${cropBox.width / cachedBounds.scaleX}px`,
      height: `${cropBox.height / cachedBounds.scaleY}px`,
    };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>Crop Head - {sourceImage?.view?.toUpperCase()}</DialogTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExpandImage}
            disabled={expanding || processing}
            className="gap-2"
          >
            {expanding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUpFromLine className="h-4 w-4" />
            )}
            Extend Image
          </Button>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col gap-4">
          {/* Crop area */}
          <div
            className="relative flex-1 bg-muted rounded-lg overflow-hidden cursor-crosshair select-none"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <img
              ref={imageRef}
              src={currentSourceUrl || sourceImage?.source_url}
              alt="Source"
              className="w-full h-full object-contain"
              onLoad={handleImageLoad}
              draggable={false}
            />

            {/* Crop overlay */}
            {cachedBounds && cropBox.width > 0 && (
              <div
                className="absolute border-2 border-primary bg-primary/10 pointer-events-none"
                style={getCropOverlayStyle()}
              >
                {/* Corner handles */}
                {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                  <div
                    key={corner}
                    className="absolute w-4 h-4 bg-primary rounded-full cursor-nwse-resize pointer-events-auto"
                    style={{
                      top: corner.includes('n') ? -8 : 'auto',
                      bottom: corner.includes('s') ? -8 : 'auto',
                      left: corner.includes('w') ? -8 : 'auto',
                      right: corner.includes('e') ? -8 : 'auto',
                    }}
                    onMouseDown={(e) => handleCornerMouseDown(e, corner)}
                  />
                ))}

                {/* Center grip */}
                <div className="absolute inset-0 cursor-move pointer-events-auto" />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={processing || expanding}>
              Cancel
            </Button>
            <Button onClick={handleApplyCrop} disabled={processing || expanding || !cropBox.width}>
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Cropping...
                </>
              ) : (
                "Apply Crop"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
