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

interface CropOutputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  outputId: string | null;
  imageUrl: string | null;
  onCropComplete: (outputId: string, newUrl: string) => void;
}

const OUTPUT_SIZE = 1000; // Final crop size

export function CropOutputDialog({
  open,
  onOpenChange,
  outputId,
  imageUrl,
  onCropComplete,
}: CropOutputDialogProps) {
  const [cropBox, setCropBox] = useState({ x: 0, y: 0, width: 200, height: 200 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeCorner, setResizeCorner] = useState<'nw' | 'ne' | 'sw' | 'se' | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [startCrop, setStartCrop] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [processing, setProcessing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Reset crop when image changes
  useEffect(() => {
    if (open && imageUrl) {
      // Reset to default center crop
      setCropBox({ x: 0, y: 0, width: 200, height: 200 });
    }
  }, [open, imageUrl]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });

    // Default crop to center, 40% of image
    const defaultSize = Math.min(img.naturalWidth, img.naturalHeight) * 0.6;
    setCropBox({
      x: (img.naturalWidth - defaultSize) / 2,
      y: (img.naturalHeight - defaultSize) / 2,
      width: defaultSize,
      height: defaultSize,
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current || !imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const scaleX = imageDimensions.width / rect.width;
    const scaleY = imageDimensions.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Check if clicking inside crop box
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
    if (!imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const scaleX = imageDimensions.width / rect.width;
    const scaleY = imageDimensions.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    setIsResizing(true);
    setResizeCorner(corner);
    setDragStart({ x, y });
    setStartCrop({ ...cropBox });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const scaleX = imageDimensions.width / rect.width;
    const scaleY = imageDimensions.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    if (isDragging) {
      let newX = x - dragStart.x;
      let newY = y - dragStart.y;

      // Constrain to image bounds
      newX = Math.max(0, Math.min(newX, imageDimensions.width - cropBox.width));
      newY = Math.max(0, Math.min(newY, imageDimensions.height - cropBox.height));

      setCropBox((prev) => ({ ...prev, x: newX, y: newY }));
    } else if (isResizing && resizeCorner) {
      const deltaX = x - dragStart.x;
      const deltaY = y - dragStart.y;

      let newCrop = { ...startCrop };

      // Maintain 1:1 aspect ratio
      const delta = Math.max(Math.abs(deltaX), Math.abs(deltaY));
      const signX = resizeCorner.includes('e') ? 1 : -1;
      const signY = resizeCorner.includes('s') ? 1 : -1;
      const effectiveDelta = (deltaX * signX + deltaY * signY) / 2;

      switch (resizeCorner) {
        case 'se':
          newCrop.width = Math.max(50, startCrop.width + effectiveDelta);
          newCrop.height = newCrop.width;
          break;
        case 'sw':
          newCrop.width = Math.max(50, startCrop.width + effectiveDelta);
          newCrop.height = newCrop.width;
          newCrop.x = startCrop.x + startCrop.width - newCrop.width;
          break;
        case 'ne':
          newCrop.width = Math.max(50, startCrop.width + effectiveDelta);
          newCrop.height = newCrop.width;
          newCrop.y = startCrop.y + startCrop.height - newCrop.height;
          break;
        case 'nw':
          newCrop.width = Math.max(50, startCrop.width + effectiveDelta);
          newCrop.height = newCrop.width;
          newCrop.x = startCrop.x + startCrop.width - newCrop.width;
          newCrop.y = startCrop.y + startCrop.height - newCrop.height;
          break;
      }

      // Constrain to image bounds
      if (newCrop.x < 0) {
        newCrop.width += newCrop.x;
        newCrop.x = 0;
      }
      if (newCrop.y < 0) {
        newCrop.height += newCrop.y;
        newCrop.y = 0;
      }
      if (newCrop.x + newCrop.width > imageDimensions.width) {
        newCrop.width = imageDimensions.width - newCrop.x;
      }
      if (newCrop.y + newCrop.height > imageDimensions.height) {
        newCrop.height = imageDimensions.height - newCrop.y;
      }
      // Keep square
      const minDim = Math.min(newCrop.width, newCrop.height);
      newCrop.width = minDim;
      newCrop.height = minDim;

      setCropBox(newCrop);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsResizing(false);
    setResizeCorner(null);
  };

  const handleApplyCrop = async () => {
    if (!outputId || !imageUrl) return;
    setProcessing(true);

    try {
      // Call edge function to crop and store
      const response = await supabase.functions.invoke("crop-and-store-image", {
        body: {
          imageUrl: imageUrl,
          cropX: cropBox.x / imageDimensions.width * 100,
          cropY: cropBox.y / imageDimensions.height * 100,
          cropWidth: cropBox.width / imageDimensions.width * 100,
          cropHeight: cropBox.height / imageDimensions.height * 100,
          outputSize: OUTPUT_SIZE,
          bucketName: "face-pairing-outputs",
          fileName: `cropped-${outputId}-${Date.now()}.png`,
        },
      });

      if (response.error) throw response.error;

      const { croppedUrl } = response.data;

      // Update the output in database
      await supabase
        .from("face_pairing_outputs")
        .update({ stored_url: croppedUrl })
        .eq("id", outputId);

      toast.success("Image cropped successfully");
      onCropComplete(outputId, croppedUrl);
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error cropping:", error);
      toast.error(error.message || "Failed to crop image");
    } finally {
      setProcessing(false);
    }
  };

  const handleReset = () => {
    if (imageDimensions.width && imageDimensions.height) {
      const defaultSize = Math.min(imageDimensions.width, imageDimensions.height) * 0.6;
      setCropBox({
        x: (imageDimensions.width - defaultSize) / 2,
        y: (imageDimensions.height - defaultSize) / 2,
        width: defaultSize,
        height: defaultSize,
      });
    }
  };

  // Calculate crop box position for display
  const getCropStyle = () => {
    if (!imageRef.current || !imageDimensions.width) return {};
    const rect = imageRef.current.getBoundingClientRect();
    const scaleX = rect.width / imageDimensions.width;
    const scaleY = rect.height / imageDimensions.height;

    return {
      left: cropBox.x * scaleX,
      top: cropBox.y * scaleY,
      width: cropBox.width * scaleX,
      height: cropBox.height * scaleY,
    };
  };

  const cropStyle = getCropStyle();

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
                className="relative bg-muted rounded-lg overflow-hidden select-none cursor-crosshair"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <img
                  ref={imageRef}
                  src={imageUrl}
                  alt="Edit"
                  className="w-full h-auto max-h-[60vh] object-contain"
                  onLoad={handleImageLoad}
                  draggable={false}
                />
                
                {/* Dark overlay - 4 regions outside crop */}
                {imageDimensions.width > 0 && imageRef.current && (
                  <>
                    {/* Top region */}
                    <div 
                      className="absolute left-0 right-0 top-0 bg-black/50 pointer-events-none"
                      style={{ height: cropStyle.top || 0 }} 
                    />
                    {/* Bottom region */}
                    <div 
                      className="absolute left-0 right-0 bg-black/50 pointer-events-none"
                      style={{ 
                        top: (cropStyle.top || 0) + (cropStyle.height || 0),
                        bottom: 0 
                      }} 
                    />
                    {/* Left region */}
                    <div 
                      className="absolute left-0 bg-black/50 pointer-events-none"
                      style={{ 
                        top: cropStyle.top || 0, 
                        width: cropStyle.left || 0, 
                        height: cropStyle.height || 0 
                      }} 
                    />
                    {/* Right region */}
                    <div 
                      className="absolute bg-black/50 pointer-events-none"
                      style={{ 
                        top: cropStyle.top || 0, 
                        left: (cropStyle.left || 0) + (cropStyle.width || 0),
                        right: 0,
                        height: cropStyle.height || 0 
                      }} 
                    />
                  </>
                )}
                
                {/* Crop box */}
                <div
                  className="absolute border-2 border-green-500 cursor-move"
                  style={cropStyle}
                >
                  {/* 1:1 indicator */}
                  <div className="absolute top-1 left-1 text-xs bg-green-500 text-white px-1 rounded">
                    1:1
                  </div>
                  {/* Corner handles */}
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
                <div 
                  className="w-32 h-32 overflow-hidden rounded border bg-muted"
                >
                  {imageUrl && imageDimensions.width > 0 && (
                    <div className="w-full h-full overflow-hidden relative">
                      <img
                        src={imageUrl}
                        alt="Preview"
                        className="absolute origin-top-left"
                        style={{
                          transform: `scale(${100 / (cropBox.width / imageDimensions.width * 100)}) translate(${-(cropBox.x / imageDimensions.width) * 100}%, ${-(cropBox.y / imageDimensions.height) * 100}%)`,
                          width: '100%',
                          height: 'auto',
                        }}
                      />
                    </div>
                  )}
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
