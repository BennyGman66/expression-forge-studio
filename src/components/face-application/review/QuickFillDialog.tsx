import { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowUpFromLine, Check, ChevronRight, Crop, Sparkles, MousePointer } from "lucide-react";
import { LookSourceImage } from "@/types/face-application";
import { OptimizedImage } from "@/components/shared/OptimizedImage";
import { cn } from "@/lib/utils";

interface QuickFillDialogProps {
  open: boolean;
  onClose: () => void;
  lookId: string;
  lookName: string;
  view: string;
  sourceImage: LookSourceImage;
  digitalTalentId: string | null;
  projectId: string;
  onComplete: () => void;
}

type Step = 'crop' | 'generate' | 'select';

const OUTPUT_SIZE = 1000;
const VIEW_LABELS: Record<string, string> = {
  front: 'Front',
  back: 'Back',
  side: 'Side',
  detail: 'Detail',
};

interface GeneratedOutput {
  id: string;
  stored_url: string;
  attempt_index: number;
}

export function QuickFillDialog({
  open,
  onClose,
  lookId,
  lookName,
  view,
  sourceImage,
  digitalTalentId,
  projectId,
  onComplete,
}: QuickFillDialogProps) {
  const [step, setStep] = useState<Step>('crop');
  const [processing, setProcessing] = useState(false);
  const [expanding, setExpanding] = useState(false);
  const [currentSourceUrl, setCurrentSourceUrl] = useState<string>("");
  const [forceDefaultCrop, setForceDefaultCrop] = useState(false);
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
  
  // Generation state
  const [generatedOutputs, setGeneratedOutputs] = useState<GeneratedOutput[]>([]);
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationTotal, setGenerationTotal] = useState(2);
  
  const imageRef = useRef<HTMLImageElement>(null);
  const { toast } = useToast();

  // Reset state when dialog opens
  useEffect(() => {
    if (open && sourceImage) {
      setStep('crop');
      setCropBox({ x: 0, y: 0, width: 0, height: 0 });
      setImageDimensions({ width: 0, height: 0 });
      setCachedBounds(null);
      setCurrentSourceUrl(sourceImage.source_url);
      setForceDefaultCrop(false);
      setGeneratedOutputs([]);
      setSelectedOutputId(null);
      setGenerationProgress(0);
    }
  }, [open, sourceImage?.id]);

  // CROP HANDLERS
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

    const shouldUseDefault = forceDefaultCrop || 
      sourceImage?.head_crop_x === null || 
      sourceImage?.head_crop_x === undefined;

    if (shouldUseDefault) {
      const defaultWidth = Math.min(newDimensions.width * 0.4, 400);
      setCropBox({
        x: (newDimensions.width - defaultWidth) / 2,
        y: 20,
        width: defaultWidth,
        height: defaultWidth,
      });
      setForceDefaultCrop(false);
    } else {
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

      setForceDefaultCrop(true);
      setCurrentSourceUrl(`${expandedUrl}?t=${Date.now()}`);
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

  const getCropOverlayStyle = () => {
    if (!cachedBounds || !cropBox.width) return { display: 'none' };

    return {
      left: `${cachedBounds.offsetX + cropBox.x / cachedBounds.scaleX}px`,
      top: `${cachedBounds.offsetY + cropBox.y / cachedBounds.scaleY}px`,
      width: `${cropBox.width / cachedBounds.scaleX}px`,
      height: `${cropBox.height / cachedBounds.scaleY}px`,
    };
  };

  // STEP HANDLERS
  const handleApplyCropAndGenerate = async () => {
    if (!imageDimensions.width || !imageDimensions.height) return;
    setProcessing(true);

    try {
      // Step 1: Apply crop
      const cropResponse = await supabase.functions.invoke("crop-and-store-image", {
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

      if (cropResponse.error) throw cropResponse.error;

      const { croppedUrl } = cropResponse.data;

      // Update database with crop data
      await supabase
        .from("look_source_images")
        .update({
          source_url: currentSourceUrl.split('?')[0],
          head_crop_x: Math.round(cropBox.x),
          head_crop_y: Math.round(cropBox.y),
          head_crop_width: Math.round(cropBox.width),
          head_crop_height: Math.round(cropBox.height),
          head_cropped_url: croppedUrl,
        })
        .eq("id", sourceImage.id);

      toast({ title: "Crop applied", description: "Starting generation..." });

      // Move to generate step
      setStep('generate');
      
      // Start generation
      await runGeneration();
      
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setProcessing(false);
    }
  };

  const runGeneration = async () => {
    try {
      setGenerationProgress(0);
      setGenerationTotal(2);

      // Invoke the generate-ai-apply function
      const response = await supabase.functions.invoke("generate-ai-apply", {
        body: {
          projectId,
          lookId,
          view: view === 'full_front' || view === 'cropped_front' ? 'front' : view,
          type: 'run',
          attemptsPerView: 2,
          model: 'google/gemini-2.5-flash-image-preview',
        },
      });

      if (response.error) throw response.error;

      // Poll for completion
      await pollForOutputs();
      
    } catch (error: any) {
      toast({ title: "Generation failed", description: error.message, variant: "destructive" });
      setProcessing(false);
    }
  };

  const pollForOutputs = useCallback(async () => {
    const normalizedView = view === 'full_front' || view === 'cropped_front' ? 'front' : view;
    let attempts = 0;
    const maxAttempts = 60; // 2 minutes max

    const poll = async () => {
      attempts++;
      
      const { data: outputs } = await supabase
        .from('ai_apply_outputs')
        .select('id, stored_url, attempt_index, status')
        .eq('look_id', lookId)
        .eq('view', normalizedView)
        .order('created_at', { ascending: false })
        .limit(10);

      const completed = outputs?.filter(o => o.status === 'completed' && o.stored_url) || [];
      const pending = outputs?.filter(o => o.status === 'pending' || o.status === 'generating') || [];
      
      setGenerationProgress(completed.length);
      
      if (completed.length >= 2 || (completed.length > 0 && pending.length === 0)) {
        // Done - move to select step
        setGeneratedOutputs(completed.map(o => ({
          id: o.id,
          stored_url: o.stored_url!,
          attempt_index: o.attempt_index ?? 0,
        })));
        setStep('select');
        setProcessing(false);
        return;
      }

      // Still pending - check if we need to trigger more
      if (pending.length > 0 && attempts % 5 === 0) {
        // Re-invoke to continue processing
        await supabase.functions.invoke("generate-ai-apply", {
          body: {
            projectId,
            lookId,
            view: normalizedView,
            type: 'run',
            attemptsPerView: 2,
            model: 'google/gemini-2.5-flash-image-preview',
          },
        });
      }

      if (attempts < maxAttempts) {
        setTimeout(poll, 2000);
      } else {
        // Timeout - show whatever we have
        if (completed.length > 0) {
          setGeneratedOutputs(completed.map(o => ({
            id: o.id,
            stored_url: o.stored_url!,
            attempt_index: o.attempt_index ?? 0,
          })));
          setStep('select');
        } else {
          toast({ title: "Generation timeout", description: "Please try again", variant: "destructive" });
        }
        setProcessing(false);
      }
    };

    poll();
  }, [lookId, view, projectId, toast]);

  const handleSelectOutput = async () => {
    if (!selectedOutputId) return;
    setProcessing(true);

    try {
      // Deselect any existing selection for this look+view
      const normalizedView = view === 'full_front' || view === 'cropped_front' ? 'front' : view;
      
      await supabase
        .from('ai_apply_outputs')
        .update({ is_selected: false })
        .eq('look_id', lookId)
        .eq('view', normalizedView);

      // Select the chosen output
      await supabase
        .from('ai_apply_outputs')
        .update({ is_selected: true })
        .eq('id', selectedOutputId);

      toast({ title: "Selection saved", description: `${VIEW_LABELS[view] || view} view completed!` });
      onComplete();
      onClose();
    } catch (error: any) {
      toast({ title: "Error saving selection", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  // RENDER
  const stepLabels = [
    { key: 'crop', label: 'Crop', icon: Crop },
    { key: 'generate', label: 'Generate', icon: Sparkles },
    { key: 'select', label: 'Select', icon: MousePointer },
  ];

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>
              Quick Add: {lookName} - {VIEW_LABELS[view] || view}
            </DialogTitle>
          </div>
          
          {/* Step indicator */}
          <div className="flex items-center gap-2 pt-2">
            {stepLabels.map((s, i) => {
              const isCurrent = s.key === step;
              const isPast = stepLabels.findIndex(x => x.key === step) > i;
              const Icon = s.icon;
              
              return (
                <div key={s.key} className="flex items-center gap-2">
                  {i > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <Badge 
                    variant={isCurrent ? "default" : isPast ? "secondary" : "outline"}
                    className={cn(
                      "gap-1.5",
                      isCurrent && "bg-primary",
                      isPast && "bg-green-100 text-green-700"
                    )}
                  >
                    {isPast ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                    {s.label}
                  </Badge>
                </div>
              );
            })}
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col gap-4">
          {/* STEP: CROP */}
          {step === 'crop' && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Position the crop box over the head area
                </p>
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
              </div>

              <div
                className="relative flex-1 bg-muted rounded-lg overflow-hidden cursor-crosshair select-none min-h-[400px]"
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

                {cachedBounds && cropBox.width > 0 && (
                  <div
                    className="absolute border-2 border-primary bg-primary/10 pointer-events-none"
                    style={getCropOverlayStyle()}
                  >
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
                    <div className="absolute inset-0 cursor-move pointer-events-auto" />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onClose} disabled={processing || expanding}>
                  Cancel
                </Button>
                <Button onClick={handleApplyCropAndGenerate} disabled={processing || expanding || !cropBox.width}>
                  {processing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      Crop & Generate
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </>
                  )}
                </Button>
              </div>
            </>
          )}

          {/* STEP: GENERATE */}
          {step === 'generate' && (
            <div className="flex-1 flex flex-col items-center justify-center gap-6">
              <div className="text-center space-y-2">
                <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
                <h3 className="text-lg font-medium">Generating...</h3>
                <p className="text-sm text-muted-foreground">
                  Creating {generationTotal} variations for {VIEW_LABELS[view] || view} view
                </p>
              </div>
              
              <div className="flex items-center gap-2">
                <div className="h-2 w-48 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-500"
                    style={{ width: `${(generationProgress / generationTotal) * 100}%` }}
                  />
                </div>
                <span className="text-sm text-muted-foreground">
                  {generationProgress}/{generationTotal}
                </span>
              </div>
            </div>
          )}

          {/* STEP: SELECT */}
          {step === 'select' && (
            <>
              <p className="text-sm text-muted-foreground">
                Click on the best result to select it
              </p>
              
              <div className="grid grid-cols-2 gap-4 flex-1">
                {generatedOutputs.map((output) => (
                  <button
                    key={output.id}
                    onClick={() => setSelectedOutputId(output.id)}
                    className={cn(
                      "relative aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all hover:scale-[1.02]",
                      selectedOutputId === output.id
                        ? "border-primary ring-2 ring-primary ring-offset-2"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <OptimizedImage
                      src={output.stored_url}
                      alt={`Attempt ${output.attempt_index + 1}`}
                      tier="preview"
                      className="object-cover"
                      containerClassName="w-full h-full"
                    />
                    
                    <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                      #{output.attempt_index + 1}
                    </div>

                    {selectedOutputId === output.id && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <div className="bg-primary text-primary-foreground rounded-full p-3">
                          <Check className="h-6 w-6" />
                        </div>
                      </div>
                    )}
                  </button>
                ))}
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleSelectOutput} 
                  disabled={!selectedOutputId || processing}
                >
                  {processing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Save Selection
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
