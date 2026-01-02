import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LookSourceImage } from "@/types/face-application";

interface HeadCropTabProps {
  lookId: string | null;
  onContinue: () => void;
}

const OUTPUT_SIZE = 1000; // Final crop size

export function HeadCropTab({ lookId, onContinue }: HeadCropTabProps) {
  const [sourceImages, setSourceImages] = useState<LookSourceImage[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cropBox, setCropBox] = useState({ x: 0, y: 0, width: 200, height: 200 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [processing, setProcessing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const { toast } = useToast();

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

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !imageRef.current) return;
    
    const rect = imageRef.current.getBoundingClientRect();
    const scaleX = imageDimensions.width / rect.width;
    const scaleY = imageDimensions.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    let newX = x - dragStart.x;
    let newY = y - dragStart.y;
    
    // Constrain to image bounds
    newX = Math.max(0, Math.min(newX, imageDimensions.width - cropBox.width));
    newY = Math.max(0, Math.min(newY, imageDimensions.height - cropBox.height));
    
    setCropBox((prev) => ({ ...prev, x: newX, y: newY }));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
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

      // Update local state
      setSourceImages((prev) =>
        prev.map((img) =>
          img.id === currentImage.id
            ? {
                ...img,
                head_crop_x: Math.round(cropBox.x),
                head_crop_y: Math.round(cropBox.y),
                head_crop_width: Math.round(cropBox.width),
                head_crop_height: Math.round(cropBox.height),
                head_cropped_url: croppedUrl,
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

  const allCropped = sourceImages.every((img) => img.head_cropped_url);

  // Calculate crop box position as percentage for display
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
                  {/* Crop overlay */}
                  <div
                    className="absolute border-2 border-green-500 bg-green-500/10 cursor-move"
                    style={getCropStyle()}
                  />
                </div>

                <div className="flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">
                    Drag the green box to select the head region (neck to nose).
                    Output will be {OUTPUT_SIZE}×{OUTPUT_SIZE}px with padding above.
                  </p>
                  <Button onClick={handleApplyCrop} disabled={processing}>
                    {processing ? "Processing..." : "Apply Crop"}
                  </Button>
                </div>

                {/* Preview cropped result */}
                {currentImage.head_cropped_url && (
                  <div className="mt-4">
                    <p className="text-sm font-medium mb-2">Preview:</p>
                    <img
                      src={currentImage.head_cropped_url}
                      alt="Cropped preview"
                      className="w-32 h-32 object-cover rounded border"
                    />
                  </div>
                )}
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
