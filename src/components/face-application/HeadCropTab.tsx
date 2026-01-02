import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Check, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LookSourceImage } from "@/types/face-application";

interface HeadCropTabProps {
  lookId: string | null;
  talentId: string | null;
  onLookChange: (lookId: string) => void;
  onContinue: () => void;
}

interface TalentLook {
  id: string;
  name: string;
}

const OUTPUT_SIZE = 1000; // Final crop size

export function HeadCropTab({ lookId, talentId, onLookChange, onContinue }: HeadCropTabProps) {
  const [looks, setLooks] = useState<TalentLook[]>([]);
  const [sourceImages, setSourceImages] = useState<LookSourceImage[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cropBox, setCropBox] = useState({ x: 0, y: 0, width: 200, height: 200 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeCorner, setResizeCorner] = useState<'nw' | 'ne' | 'sw' | 'se' | null>(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, cropX: 0, cropY: 0, cropWidth: 0, cropHeight: 0 });
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [processing, setProcessing] = useState(false);
  const [expanding, setExpanding] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const { toast } = useToast();

  // Fetch all looks for the talent
  useEffect(() => {
    if (!talentId) return;
    const fetchLooks = async () => {
      const { data } = await supabase
        .from("talent_looks")
        .select("id, name")
        .eq("digital_talent_id", talentId)
        .order("created_at");
      if (data) {
        setLooks(data);
      }
    };
    fetchLooks();
  }, [talentId]);

  // Fetch source images for current look
  useEffect(() => {
    if (!lookId) return;
    const fetchSourceImages = async () => {
      const { data } = await supabase
        .from("look_source_images")
        .select("*")
        .eq("look_id", lookId)
        .order("view");
      if (data) {
        setSourceImages(data as LookSourceImage[]);
        setSelectedIndex(0);
        // Initialize crop box from existing data if available
        const first = data[0];
        if (first?.head_crop_x !== null) {
          setCropBox({
            x: first.head_crop_x || 0,
            y: first.head_crop_y || 0,
            width: first.head_crop_width || 200,
            height: first.head_crop_height || 200,
          });
        }
      }
    };
    fetchSourceImages();
  }, [lookId]);

  const currentImage = sourceImages[selectedIndex];

  // Helper to get actual rendered image bounds (accounting for object-contain letterboxing)
  const getImageBounds = () => {
    if (!imageRef.current || !imageDimensions.width) return null;
    
    const rect = imageRef.current.getBoundingClientRect();
    const containerAspect = rect.width / rect.height;
    const imageAspect = imageDimensions.width / imageDimensions.height;
    
    let renderedWidth: number;
    let renderedHeight: number;
    let offsetX: number;
    let offsetY: number;
    
    if (imageAspect > containerAspect) {
      // Image is wider than container - width fills, height has letterboxing
      renderedWidth = rect.width;
      renderedHeight = rect.width / imageAspect;
      offsetX = 0;
      offsetY = (rect.height - renderedHeight) / 2;
    } else {
      // Image is taller than container - height fills, width has letterboxing
      renderedHeight = rect.height;
      renderedWidth = rect.height * imageAspect;
      offsetX = (rect.width - renderedWidth) / 2;
      offsetY = 0;
    }
    
    return {
      offsetX,
      offsetY,
      renderedWidth,
      renderedHeight,
      scaleX: imageDimensions.width / renderedWidth,
      scaleY: imageDimensions.height / renderedHeight,
    };
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    
    // Default crop to top-center if no existing crop
    if (!currentImage?.head_crop_x) {
      const defaultWidth = Math.min(img.naturalWidth * 0.4, 400);
      setCropBox({
        x: (img.naturalWidth - defaultWidth) / 2,
        y: 20,
        width: defaultWidth,
        height: defaultWidth,
      });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current || !imageRef.current) return;
    
    const bounds = getImageBounds();
    if (!bounds) return;
    
    const rect = imageRef.current.getBoundingClientRect();
    
    // Convert client coordinates to image coordinates, accounting for letterboxing
    const x = (e.clientX - rect.left - bounds.offsetX) * bounds.scaleX;
    const y = (e.clientY - rect.top - bounds.offsetY) * bounds.scaleY;
    
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
    
    const bounds = getImageBounds();
    if (!bounds) return;
    
    const rect = imageRef.current.getBoundingClientRect();
    
    setIsResizing(true);
    setResizeCorner(corner);
    setResizeStart({
      x: (e.clientX - rect.left - bounds.offsetX) * bounds.scaleX,
      y: (e.clientY - rect.top - bounds.offsetY) * bounds.scaleY,
      cropX: cropBox.x,
      cropY: cropBox.y,
      cropWidth: cropBox.width,
      cropHeight: cropBox.height,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!imageRef.current) return;
    
    const bounds = getImageBounds();
    if (!bounds) return;
    
    const rect = imageRef.current.getBoundingClientRect();
    
    const x = (e.clientX - rect.left - bounds.offsetX) * bounds.scaleX;
    const y = (e.clientY - rect.top - bounds.offsetY) * bounds.scaleY;
    
    if (isResizing && resizeCorner) {
      const deltaX = x - resizeStart.x;
      const deltaY = y - resizeStart.y;
      
      let newX = resizeStart.cropX;
      let newY = resizeStart.cropY;
      let newSize = resizeStart.cropWidth;
      
      // Use the larger delta to maintain 1:1 aspect ratio
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
      
      // Constrain to image bounds
      newX = Math.max(0, newX);
      newY = Math.max(0, newY);
      newSize = Math.min(newSize, imageDimensions.width - newX, imageDimensions.height - newY);
      
      setCropBox({ x: newX, y: newY, width: newSize, height: newSize });
      return;
    }
    
    if (isDragging) {
      let newX = x - dragStart.x;
      let newY = y - dragStart.y;
      
      // Constrain to image bounds
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

  const handleApplyCrop = async () => {
    if (!currentImage) return;
    setProcessing(true);

    try {
      // Call edge function to crop and add padding
      const response = await supabase.functions.invoke("crop-look-head", {
        body: {
          imageUrl: currentImage.source_url,
          cropX: Math.round(cropBox.x),
          cropY: Math.round(cropBox.y),
          cropWidth: Math.round(cropBox.width),
          cropHeight: Math.round(cropBox.height),
          outputSize: OUTPUT_SIZE,
          imageId: currentImage.id,
        },
      });

      if (response.error) throw response.error;

      const { croppedUrl } = response.data;

      // Update database
      await supabase
        .from("look_source_images")
        .update({
          head_crop_x: Math.round(cropBox.x),
          head_crop_y: Math.round(cropBox.y),
          head_crop_width: Math.round(cropBox.width),
          head_crop_height: Math.round(cropBox.height),
          head_cropped_url: croppedUrl,
        })
        .eq("id", currentImage.id);

      // Update local state with cache-busted URL
      const cacheBustedUrl = `${croppedUrl}?t=${Date.now()}`;
      setSourceImages((prev) =>
        prev.map((img) =>
          img.id === currentImage.id
            ? {
                ...img,
                head_crop_x: Math.round(cropBox.x),
                head_crop_y: Math.round(cropBox.y),
                head_crop_width: Math.round(cropBox.width),
                head_crop_height: Math.round(cropBox.height),
                head_cropped_url: cacheBustedUrl,
              }
            : img
        )
      );

      toast({ title: "Crop applied", description: `${currentImage.view} head cropped successfully.` });

      // Move to next image if available
      if (selectedIndex < sourceImages.length - 1) {
        setSelectedIndex(selectedIndex + 1);
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const handleExpandImage = async () => {
    if (!currentImage) return;
    setExpanding(true);

    try {
      const response = await supabase.functions.invoke("expand-image-top", {
        body: {
          imageUrl: currentImage.source_url,
          imageId: currentImage.id,
          paddingPercent: 20,
        },
      });

      if (response.error) throw response.error;

      const { expandedUrl } = response.data;

      // Update local state with new source URL
      setSourceImages((prev) =>
        prev.map((img) =>
          img.id === currentImage.id
            ? { ...img, source_url: expandedUrl }
            : img
        )
      );

      toast({ 
        title: "Image expanded", 
        description: "Added 20% white space to top of image." 
      });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setExpanding(false);
    }
  };

  const allCropped = sourceImages.every((img) => img.head_cropped_url);

  // Calculate crop box position accounting for letterboxing
  const getCropStyle = () => {
    const bounds = getImageBounds();
    if (!bounds) return {};
    
    return {
      left: bounds.offsetX + cropBox.x / bounds.scaleX,
      top: bounds.offsetY + cropBox.y / bounds.scaleY,
      width: cropBox.width / bounds.scaleX,
      height: cropBox.height / bounds.scaleY,
    };
  };

  // The live preview shows: top half = white, bottom half = the selection
  // This matches the actual output from the edge function
  const getLivePreviewStyle = () => {
    if (!imageDimensions.width || !cropBox.width) return null;
    
    // Preview container is 160x160 (w-40 h-40)
    // Bottom half shows the selection scaled to 160x80
    const previewWidth = 160;
    const previewBottomHalfHeight = 80;
    
    // Scale the source image so the selection width fits the preview width
    const scale = previewWidth / cropBox.width;
    
    // Position offset to show only the selection in the bottom half
    const left = -cropBox.x * scale;
    const top = -cropBox.y * scale;
    
    return {
      width: imageDimensions.width * scale,
      height: imageDimensions.height * scale,
      left,
      top,
    };
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-6">
        {/* Left: Thumbnails */}
        <Card>
          <CardHeader>
            <CardTitle>Source Images</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {sourceImages.map((img, index) => (
              <button
                key={img.id}
                onClick={() => {
                  setSelectedIndex(index);
                  if (img.head_crop_x !== null) {
                    setCropBox({
                      x: img.head_crop_x,
                      y: img.head_crop_y!,
                      width: img.head_crop_width!,
                      height: img.head_crop_height!,
                    });
                  }
                }}
                className={`
                  w-full flex items-center gap-3 p-2 rounded-lg transition-colors
                  ${index === selectedIndex ? "bg-primary/10 border border-primary" : "hover:bg-muted"}
                `}
              >
                <img
                  src={img.source_url}
                  alt={img.view}
                  className="w-12 h-16 object-cover rounded"
                />
                <div className="flex-1 text-left">
                  <p className="font-medium capitalize">{img.view}</p>
                  {img.head_cropped_url && (
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <Check className="h-3 w-3" /> Cropped
                    </p>
                  )}
                </div>
              </button>
            ))}
          </CardContent>

          {/* Looks Quick Switcher */}
          {looks.length > 0 && (
            <div className="border-t p-3">
              <p className="text-xs text-muted-foreground mb-2">Switch Look</p>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                {looks.map((look) => (
                  <Button
                    key={look.id}
                    size="sm"
                    variant={look.id === lookId ? "default" : "outline"}
                    className="shrink-0 text-xs"
                    onClick={() => onLookChange(look.id)}
                  >
                    {look.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Center: Crop Editor */}
        <Card className="col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Crop Head Region</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                disabled={selectedIndex === 0}
                onClick={() => setSelectedIndex(selectedIndex - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {selectedIndex + 1} / {sourceImages.length}
              </span>
              <Button
                variant="outline"
                size="icon"
                disabled={selectedIndex === sourceImages.length - 1}
                onClick={() => setSelectedIndex(selectedIndex + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {currentImage ? (
              <div className="space-y-4">
                <div
                  ref={containerRef}
                  className="relative bg-muted rounded-lg overflow-hidden select-none"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  <img
                    ref={imageRef}
                    src={currentImage.source_url}
                    alt={currentImage.view}
                    className="w-full h-auto max-h-[500px] object-contain"
                    onLoad={handleImageLoad}
                    draggable={false}
                  />
                  {/* No expanded area indicator needed - the selection IS the bottom half */}
                  {/* Crop overlay (green box = bottom half of output) */}
                  <div
                    className="absolute border-2 border-green-500 bg-green-500/10 cursor-move"
                    style={getCropStyle()}
                  >
                    {/* Corner resize handles */}
                    {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                      <div
                        key={corner}
                        className="absolute w-3 h-3 bg-green-500 border-2 border-white rounded-full shadow-sm"
                        style={{
                          cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize',
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
                    <span className="text-green-600 font-medium">Green box</span> = your selection (becomes bottom half). 
                    Top half will be white padding. Output: {OUTPUT_SIZE}×{OUTPUT_SIZE}px
                  </p>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      onClick={handleExpandImage} 
                      disabled={expanding || processing}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      {expanding ? "Expanding..." : "Increase Image"}
                    </Button>
                    <Button onClick={handleApplyCrop} disabled={processing || expanding}>
                      {processing ? "Processing..." : "Apply Crop"}
                    </Button>
                  </div>
                </div>

                {/* Preview of Full Output */}
                <div className="mt-4">
                  <p className="text-sm font-medium mb-2">
                    {currentImage.head_cropped_url ? "Saved Result" : "Live Preview"} ({OUTPUT_SIZE}×{OUTPUT_SIZE} output):
                  </p>
                  <div className="relative w-40 h-40 overflow-hidden rounded border bg-white">
                    {currentImage.head_cropped_url ? (
                      <img
                        src={currentImage.head_cropped_url}
                        alt="Cropped result"
                        className="w-full h-full object-contain"
                        draggable={false}
                      />
                    ) : (
                      <div className="absolute bottom-0 left-0 right-0 h-1/2 overflow-hidden">
                        {getLivePreviewStyle() && (
                          <img
                            src={currentImage.source_url}
                            alt="Live preview"
                            className="absolute"
                            style={{
                              width: getLivePreviewStyle()!.width,
                              height: getLivePreviewStyle()!.height,
                              left: getLivePreviewStyle()!.left,
                              top: getLivePreviewStyle()!.top,
                            }}
                            draggable={false}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No images to crop
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Continue Button */}
      <div className="flex justify-end">
        <Button size="lg" disabled={!allCropped} onClick={onContinue}>
          Continue to Face Match
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
