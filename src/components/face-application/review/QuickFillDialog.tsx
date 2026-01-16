import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, 
  ArrowUpFromLine, 
  Check, 
  ChevronRight, 
  Crop, 
  Sparkles, 
  MousePointer,
  User,
  List,
  ArrowRight
} from "lucide-react";
import { LookSourceImage, VIEW_LABELS } from "@/types/face-application";
import { OptimizedImage } from "@/components/shared/OptimizedImage";
import { cn } from "@/lib/utils";

interface MissingViewItem {
  view: string;
  sourceImage: {
    id: string;
    look_id: string;
    digital_talent_id: string | null;
    view: string;
    source_url: string;
    head_cropped_url: string | null;
  };
}

interface QuickFillDialogProps {
  open: boolean;
  onClose: () => void;
  lookId: string;
  lookName: string;
  missingViews: MissingViewItem[];
  digitalTalentId: string | null;
  projectId: string;
  onComplete: () => void;
}

type Step = 'pick' | 'crop' | 'match' | 'generate' | 'select';

const OUTPUT_SIZE = 1000;

interface GeneratedOutput {
  id: string;
  stored_url: string;
  attempt_index: number;
}

interface FaceFoundation {
  id: string;
  stored_url: string;
  view: string;
}

export function QuickFillDialog({
  open,
  onClose,
  lookId,
  lookName,
  missingViews,
  digitalTalentId,
  projectId,
  onComplete,
}: QuickFillDialogProps) {
  // View selection state
  const [selectedView, setSelectedView] = useState<string>('');
  const [activeSourceImage, setActiveSourceImage] = useState<MissingViewItem['sourceImage'] | null>(null);
  
  const [step, setStep] = useState<Step>('pick');
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
  
  // Face match state
  const [faceFoundations, setFaceFoundations] = useState<FaceFoundation[]>([]);
  const [selectedFaceUrl, setSelectedFaceUrl] = useState<string | null>(null);
  const [talentFrontFace, setTalentFrontFace] = useState<string | null>(null);
  
  // Generation state
  const [generatedOutputs, setGeneratedOutputs] = useState<GeneratedOutput[]>([]);
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationTotal, setGenerationTotal] = useState(2);
  
  const imageRef = useRef<HTMLImageElement>(null);
  const { toast } = useToast();

  // Normalize view name
  const normalizeView = (view: string): string => {
    if (view === 'full_front' || view === 'cropped_front') return 'front';
    if (view === 'side') return 'detail';
    return view;
  };

  // Reset state when dialog opens
  useEffect(() => {
    if (open && missingViews.length > 0) {
      // If only one missing view, auto-select it and skip to crop
      if (missingViews.length === 1) {
        setSelectedView(missingViews[0].view);
        setActiveSourceImage(missingViews[0].sourceImage);
        setCurrentSourceUrl(missingViews[0].sourceImage.source_url);
        setStep('crop');
      } else {
        setStep('pick');
        setSelectedView('');
        setActiveSourceImage(null);
        setCurrentSourceUrl('');
      }
      
      // Reset other state
      setCropBox({ x: 0, y: 0, width: 0, height: 0 });
      setImageDimensions({ width: 0, height: 0 });
      setCachedBounds(null);
      setForceDefaultCrop(false);
      setGeneratedOutputs([]);
      setSelectedOutputId(null);
      setGenerationProgress(0);
      setSelectedFaceUrl(null);
      setProcessing(false);
    }
  }, [open, missingViews]);

  // Fetch face foundations on mount
  useEffect(() => {
    if (!open || !digitalTalentId) return;
    
    const fetchFoundations = async () => {
      try {
        // Get face foundations for this talent from face_pairing_outputs
        const { data: foundationsData } = await supabase
          .from("face_pairing_outputs")
          .select(`
            id, stored_url,
            pairing:face_pairings!inner(digital_talent_id, cropped_face_id)
          `)
          .eq("status", "completed")
          .eq("is_face_foundation", true)
          .not("stored_url", "is", null);

        if (foundationsData) {
          const foundations: FaceFoundation[] = [];
          for (const output of foundationsData) {
            const pairing = output.pairing as any;
            if (pairing?.digital_talent_id === digitalTalentId && output.stored_url) {
              // Get view from face_identity_images
              const { data: identityImage } = await supabase
                .from("face_identity_images")
                .select("view")
                .eq("scrape_image_id", pairing.cropped_face_id)
                .maybeSingle();
              
              foundations.push({
                id: output.id,
                stored_url: output.stored_url,
                view: identityImage?.view || "front",
              });
            }
          }
          setFaceFoundations(foundations);
        }

        // Also get talent's front face as fallback
        const { data: talent } = await supabase
          .from("digital_talents")
          .select("front_face_url")
          .eq("id", digitalTalentId)
          .single();
        
        if (talent?.front_face_url) {
          setTalentFrontFace(talent.front_face_url);
        }
      } catch (error) {
        console.error("Error fetching face foundations:", error);
      }
    };

    fetchFoundations();
  }, [open, digitalTalentId]);

  // Pick view handler
  const handlePickView = (view: string, sourceImage: MissingViewItem['sourceImage']) => {
    setSelectedView(view);
    setActiveSourceImage(sourceImage);
    setCurrentSourceUrl(sourceImage.source_url);
    setForceDefaultCrop(true);
    setCropBox({ x: 0, y: 0, width: 0, height: 0 });
    setCachedBounds(null);
    setStep('crop');
  };

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
      !activeSourceImage?.head_cropped_url;

    if (shouldUseDefault) {
      const defaultWidth = Math.min(newDimensions.width * 0.4, 400);
      setCropBox({
        x: (newDimensions.width - defaultWidth) / 2,
        y: 20,
        width: defaultWidth,
        height: defaultWidth,
      });
      setForceDefaultCrop(false);
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
    if (!activeSourceImage) return;
    setExpanding(true);

    try {
      const response = await supabase.functions.invoke("expand-image-top", {
        body: {
          imageUrl: currentSourceUrl,
          imageId: activeSourceImage.id,
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
        .eq("id", activeSourceImage.id);

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
  const handleApplyCropAndMatch = async () => {
    if (!imageDimensions.width || !imageDimensions.height || !activeSourceImage) return;
    setProcessing(true);

    try {
      // Apply crop
      const cropResponse = await supabase.functions.invoke("crop-and-store-image", {
        body: {
          imageUrl: currentSourceUrl,
          cropX: (cropBox.x / imageDimensions.width) * 100,
          cropY: (cropBox.y / imageDimensions.height) * 100,
          cropWidth: (cropBox.width / imageDimensions.width) * 100,
          cropHeight: (cropBox.height / imageDimensions.height) * 100,
          targetSize: OUTPUT_SIZE,
          cropId: `look-head-${activeSourceImage.id}`,
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
        .eq("id", activeSourceImage.id);

      toast({ title: "Crop applied" });

      // Auto-select best matching face for this view
      const normalizedSelectedView = normalizeView(selectedView);
      const matchingFace = faceFoundations.find(f => f.view === normalizedSelectedView);
      const fallbackFace = faceFoundations[0]?.stored_url || talentFrontFace;
      setSelectedFaceUrl(matchingFace?.stored_url || fallbackFace || null);

      // Move to match step
      setStep('match');
      setProcessing(false);
      
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setProcessing(false);
    }
  };

  // Match step handler
  const handleConfirmMatch = async () => {
    if (!selectedFaceUrl || !activeSourceImage) {
      toast({ title: "Select a face", description: "Please select a face reference to continue", variant: "destructive" });
      return;
    }
    setProcessing(true);

    try {
      // Save matched_face_url to database
      const { error } = await supabase
        .from("look_source_images")
        .update({ matched_face_url: selectedFaceUrl })
        .eq("id", activeSourceImage.id);

      if (error) throw error;

      toast({ title: "Face matched", description: "Starting generation..." });
      
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

      const normalizedSelectedView = normalizeView(selectedView);

      // Invoke the generate-ai-apply function
      const response = await supabase.functions.invoke("generate-ai-apply", {
        body: {
          projectId,
          lookId,
          view: normalizedSelectedView,
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
    const normalizedSelectedView = normalizeView(selectedView);
    let attempts = 0;
    const maxAttempts = 60; // 2 minutes max

    const poll = async () => {
      attempts++;
      
      const { data: outputs } = await supabase
        .from('ai_apply_outputs')
        .select('id, stored_url, attempt_index, status')
        .eq('look_id', lookId)
        .eq('view', normalizedSelectedView)
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
      if (pending.length > 0 && attempts % 2 === 0) {
        // Re-invoke to continue processing
        await supabase.functions.invoke("generate-ai-apply", {
          body: {
            projectId,
            lookId,
            view: normalizedSelectedView,
            type: 'run',
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
  }, [lookId, selectedView, projectId, toast]);

  const handleSelectOutput = async () => {
    if (!selectedOutputId) return;
    setProcessing(true);

    try {
      const normalizedSelectedView = normalizeView(selectedView);
      
      // Deselect any existing selection for this look+view
      await supabase
        .from('ai_apply_outputs')
        .update({ is_selected: false })
        .eq('look_id', lookId)
        .eq('view', normalizedSelectedView);

      // Select the chosen output
      await supabase
        .from('ai_apply_outputs')
        .update({ is_selected: true })
        .eq('id', selectedOutputId);

      toast({ title: "Selection saved", description: `${VIEW_LABELS[selectedView] || selectedView} view completed!` });
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
    { key: 'pick', label: 'Pick', icon: List },
    { key: 'crop', label: 'Crop', icon: Crop },
    { key: 'match', label: 'Match', icon: User },
    { key: 'generate', label: 'Generate', icon: Sparkles },
    { key: 'select', label: 'Select', icon: MousePointer },
  ];
  
  const currentStepIndex = stepLabels.findIndex(s => s.key === step);
  const skipPick = missingViews.length === 1;

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>
              Quick Add: {lookName}
              {selectedView && ` - ${VIEW_LABELS[selectedView] || selectedView}`}
            </DialogTitle>
            
            {/* Step indicator */}
            <div className="flex items-center gap-1 text-sm font-normal">
              {stepLabels.map((s, i) => {
                // Skip "Pick" step indicator if only one view
                if (skipPick && s.key === 'pick') return null;
                
                const Icon = s.icon;
                const isActive = s.key === step;
                const isPast = i < currentStepIndex;
                
                return (
                  <React.Fragment key={s.key}>
                    {i > 0 && !(skipPick && s.key === 'crop') && (
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    )}
                    <span className={cn(
                      "flex items-center gap-1 px-2 py-0.5 rounded",
                      isActive && "bg-primary/10 text-primary font-medium",
                      isPast && "text-green-600"
                    )}>
                      {isPast ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                      {s.label}
                    </span>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {/* PICK STEP */}
          {step === 'pick' && (
            <div className="space-y-4 p-4">
              <p className="text-sm text-muted-foreground">
                Select which view you'd like to generate:
              </p>
              
              <div className="grid grid-cols-2 gap-3">
                {missingViews.map(({ view, sourceImage }) => (
                  <button
                    key={view}
                    onClick={() => handlePickView(view, sourceImage)}
                    className="relative aspect-[3/4] rounded-lg overflow-hidden border-2 border-transparent hover:border-primary transition-all group"
                  >
                    <img
                      src={sourceImage.source_url}
                      alt={view}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <span className="text-white font-medium capitalize">{VIEW_LABELS[view] || view}</span>
                    </div>
                    <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <ArrowRight className="h-8 w-8 text-white drop-shadow-lg" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CROP STEP */}
          {step === 'crop' && currentSourceUrl && (
            <div className="space-y-4">
              {/* Toolbar */}
              <div className="flex items-center justify-between px-4">
                <p className="text-sm text-muted-foreground">
                  Position crop box over the head for <span className="font-medium">{VIEW_LABELS[selectedView] || selectedView}</span>
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExpandImage}
                  disabled={expanding}
                >
                  {expanding ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ArrowUpFromLine className="h-4 w-4 mr-2" />
                  )}
                  Extend Top +20%
                </Button>
              </div>

              {/* Crop area */}
              <div 
                className="relative w-full aspect-[3/4] bg-muted overflow-hidden cursor-crosshair select-none"
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <img
                  ref={imageRef}
                  src={currentSourceUrl}
                  alt="Source"
                  className="w-full h-full object-contain"
                  onLoad={handleImageLoad}
                  draggable={false}
                />

                {/* Crop overlay */}
                {cropBox.width > 0 && (
                  <div
                    className="absolute border-2 border-[#C6F135] bg-[#C6F135]/10"
                    style={getCropOverlayStyle()}
                    onMouseDown={handleMouseDown}
                  >
                    {/* Resize handles */}
                    {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                      <div
                        key={corner}
                        className={cn(
                          "absolute w-3 h-3 bg-[#C6F135] border border-black/30",
                          corner === 'nw' && "top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nw-resize",
                          corner === 'ne' && "top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-ne-resize",
                          corner === 'sw' && "bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-sw-resize",
                          corner === 'se' && "bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-se-resize"
                        )}
                        onMouseDown={(e) => handleCornerMouseDown(e, corner)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between px-4 pb-4">
                <div className="flex items-center gap-2">
                  {missingViews.length > 1 && (
                    <Button variant="ghost" onClick={() => setStep('pick')}>
                      Back
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleApplyCropAndMatch}
                    disabled={processing || !cropBox.width}
                    className="bg-[#C6F135] text-black hover:bg-[#C6F135]/80"
                  >
                    {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Crop & Continue
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* MATCH STEP */}
          {step === 'match' && (
            <div className="space-y-4 p-4">
              <p className="text-sm text-muted-foreground">
                Select the face reference to apply to <span className="font-medium">{VIEW_LABELS[selectedView] || selectedView}</span>:
              </p>
              
              <div className="grid grid-cols-3 gap-3">
                {faceFoundations.map((foundation) => (
                  <button
                    key={foundation.id}
                    onClick={() => setSelectedFaceUrl(foundation.stored_url)}
                    className={cn(
                      "relative aspect-square rounded-lg overflow-hidden border-2 transition-all",
                      selectedFaceUrl === foundation.stored_url
                        ? "border-green-500 ring-2 ring-green-500/30"
                        : "border-transparent hover:border-primary/50"
                    )}
                  >
                    <img
                      src={foundation.stored_url}
                      alt={foundation.view}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] py-0.5 text-center capitalize">
                      {foundation.view}
                    </span>
                    {selectedFaceUrl === foundation.stored_url && (
                      <div className="absolute top-1 right-1 bg-green-500 rounded-full p-0.5">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    )}
                  </button>
                ))}
                
                {/* Fallback: Talent front face if no foundations */}
                {faceFoundations.length === 0 && talentFrontFace && (
                  <button
                    onClick={() => setSelectedFaceUrl(talentFrontFace)}
                    className={cn(
                      "relative aspect-square rounded-lg overflow-hidden border-2 transition-all",
                      selectedFaceUrl === talentFrontFace
                        ? "border-green-500 ring-2 ring-green-500/30"
                        : "border-transparent hover:border-primary/50"
                    )}
                  >
                    <img
                      src={talentFrontFace}
                      alt="Primary Portrait"
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] py-0.5 text-center">
                      Primary Portrait
                    </span>
                    {selectedFaceUrl === talentFrontFace && (
                      <div className="absolute top-1 right-1 bg-green-500 rounded-full p-0.5">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    )}
                  </button>
                )}
              </div>

              {faceFoundations.length === 0 && !talentFrontFace && (
                <p className="text-sm text-yellow-600 text-center py-4">
                  No face foundations available. Please create them in Talent Face Library first.
                </p>
              )}

              <div className="flex justify-between pt-4">
                <Button variant="ghost" onClick={() => setStep('crop')}>
                  Back
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleConfirmMatch}
                    disabled={!selectedFaceUrl || processing}
                    className="bg-[#C6F135] text-black hover:bg-[#C6F135]/80"
                  >
                    {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Match & Generate
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* GENERATE STEP */}
          {step === 'generate' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-lg font-medium">Generating variations...</p>
              <p className="text-sm text-muted-foreground">
                {generationProgress} of {generationTotal} complete
              </p>
            </div>
          )}

          {/* SELECT STEP */}
          {step === 'select' && (
            <div className="space-y-4 p-4">
              <p className="text-sm text-muted-foreground">
                Select the best result:
              </p>
              
              <div className="grid grid-cols-2 gap-4">
                {generatedOutputs.map((output) => (
                  <button
                    key={output.id}
                    onClick={() => setSelectedOutputId(output.id)}
                    className={cn(
                      "relative aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all",
                      selectedOutputId === output.id
                        ? "border-green-500 ring-2 ring-green-500/30"
                        : "border-muted hover:border-primary/50"
                    )}
                  >
                    <OptimizedImage
                      src={output.stored_url}
                      alt={`Attempt ${output.attempt_index + 1}`}
                      tier="preview"
                      className="object-cover"
                      containerClassName="w-full h-full"
                    />
                    <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
                      #{output.attempt_index + 1}
                    </div>
                    {selectedOutputId === output.id && (
                      <div className="absolute top-2 right-2 bg-green-500 rounded-full p-1">
                        <Check className="h-4 w-4 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSelectOutput}
                  disabled={!selectedOutputId || processing}
                  className="bg-[#C6F135] text-black hover:bg-[#C6F135]/80"
                >
                  {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Selection
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
