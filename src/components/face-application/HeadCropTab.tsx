import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Check, ChevronLeft, ChevronRight, Plus, RotateCcw, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LookSourceImage } from "@/types/face-application";
import { useWorkflowStateContext } from "@/contexts/WorkflowStateContext";
import { LooksSwitcher } from "./shared/LooksSwitcher";
import { isViewComplete, lookNeedsActionForTab } from "@/lib/workflowFilterUtils";

interface HeadCropTabProps {
  projectId: string;
  lookId: string | null;
  talentId: string | null;
  selectedLookIds?: Set<string>;
  onLookChange: (lookId: string) => void;
  onContinue: () => void;
}

interface TalentLook {
  id: string;
  name: string;
  digital_talent_id: string | null;
}

const OUTPUT_SIZE = 1000; // Final crop size

export function HeadCropTab({ projectId, lookId, talentId, selectedLookIds, onLookChange, onContinue }: HeadCropTabProps) {
  const [looks, setLooks] = useState<TalentLook[]>([]);
  const [sourceImages, setSourceImages] = useState<LookSourceImage[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
const [cropBox, setCropBox] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeCorner, setResizeCorner] = useState<'nw' | 'ne' | 'sw' | 'se' | null>(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, cropX: 0, cropY: 0, cropWidth: 0, cropHeight: 0 });
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [imageReady, setImageReady] = useState(false);
  const [forceDefaultCrop, setForceDefaultCrop] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [expanding, setExpanding] = useState(false);
  const [expandingAll, setExpandingAll] = useState(false);
  const [expandProgress, setExpandProgress] = useState({ current: 0, total: 0 });
  const [ignoringLook, setIgnoringLook] = useState(false);
  // Cached bounds to ensure consistent coordinate calculations
  const [cachedBounds, setCachedBounds] = useState<{
    offsetX: number;
    offsetY: number;
    renderedWidth: number;
    renderedHeight: number;
    scaleX: number;
    scaleY: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();
  const workflowState = useWorkflowStateContext();

  // Fetch all looks for the PROJECT (not just one talent)
  useEffect(() => {
    if (!projectId) return;
    const fetchLooks = async () => {
      const { data } = await supabase
        .from("talent_looks")
        .select("id, name, digital_talent_id")
        .eq("project_id", projectId)
        .order("created_at");
      if (data) {
        // Filter by selectedLookIds if provided
        const filteredLooks = selectedLookIds && selectedLookIds.size > 0
          ? data.filter(l => selectedLookIds.has(l.id))
          : data;
        setLooks(filteredLooks);
        // Auto-select first look if none selected or current is not in filtered list
        if (filteredLooks.length > 0) {
          if (!lookId || !filteredLooks.find(l => l.id === lookId)) {
            onLookChange(filteredLooks[0].id);
          }
        }
      }
    };
    fetchLooks();
  }, [projectId, lookId, onLookChange, selectedLookIds]);

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

  // Reset state when switching images to prevent stale dimensions
  useEffect(() => {
    setImageReady(false);
    setCropBox({ x: 0, y: 0, width: 0, height: 0 });
    setImageDimensions({ width: 0, height: 0 });
    setCachedBounds(null); // Clear cached bounds
    setForceDefaultCrop(false);
  }, [selectedIndex]);

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
    const newDimensions = { width: img.naturalWidth, height: img.naturalHeight };
    setImageDimensions(newDimensions);
    
    // Calculate and CACHE bounds immediately when image loads
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
    
    // If forceDefaultCrop is set (e.g., after expansion), use defaults regardless of saved data
    const shouldUseDefault = forceDefaultCrop || 
      currentImage?.head_crop_x === null || 
      currentImage?.head_crop_x === undefined;
    
    if (shouldUseDefault) {
      // Default crop to top-center
      const defaultWidth = Math.min(newDimensions.width * 0.4, 400);
      setCropBox({
        x: (newDimensions.width - defaultWidth) / 2,
        y: 20,
        width: defaultWidth,
        height: defaultWidth,
      });
      setForceDefaultCrop(false); // Reset the flag after using it
    } else {
      // Use saved crop data
      setCropBox({
        x: currentImage.head_crop_x,
        y: currentImage.head_crop_y || 0,
        width: currentImage.head_crop_width || 200,
        height: currentImage.head_crop_height || 200,
      });
    }
    
    setImageReady(true);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current || !imageRef.current || !cachedBounds) return;
    
    const rect = imageRef.current.getBoundingClientRect();
    
    // Convert client coordinates to image coordinates using CACHED bounds
    const x = (e.clientX - rect.left - cachedBounds.offsetX) * cachedBounds.scaleX;
    const y = (e.clientY - rect.top - cachedBounds.offsetY) * cachedBounds.scaleY;
    
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
    
    // Use CACHED bounds for consistent coordinate conversion
    const x = (e.clientX - rect.left - cachedBounds.offsetX) * cachedBounds.scaleX;
    const y = (e.clientY - rect.top - cachedBounds.offsetY) * cachedBounds.scaleY;
    
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
    if (!currentImage || !imageDimensions.width || !imageDimensions.height) return;
    setProcessing(true);

    try {
      // Call crop-and-store-image directly with percentage coordinates
      // This is the same approach used by CropOutputDialog which works correctly
      const response = await supabase.functions.invoke("crop-and-store-image", {
        body: {
          imageUrl: currentImage.source_url,
          // Convert pixel coordinates to percentages
          cropX: (cropBox.x / imageDimensions.width) * 100,
          cropY: (cropBox.y / imageDimensions.height) * 100,
          cropWidth: (cropBox.width / imageDimensions.width) * 100,
          cropHeight: (cropBox.height / imageDimensions.height) * 100,
          targetSize: OUTPUT_SIZE,
          cropId: `look-head-${currentImage.id}`,
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

      // Update workflow state
      try {
        await workflowState.updateViewState(currentImage.look_id, currentImage.view, 'crop', 'completed');
      } catch (e) {
        console.error('Failed to update workflow state:', e);
      }

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

  const handleResetCrop = async () => {
    if (!currentImage) return;
    
    try {
      // Clear crop data in database
      await supabase
        .from("look_source_images")
        .update({
          head_crop_x: null,
          head_crop_y: null,
          head_crop_width: null,
          head_crop_height: null,
          head_cropped_url: null,
        })
        .eq("id", currentImage.id);

      // Update local state
      setSourceImages((prev) =>
        prev.map((img) =>
          img.id === currentImage.id
            ? {
                ...img,
                head_crop_x: null,
                head_crop_y: null,
                head_crop_width: null,
                head_crop_height: null,
                head_cropped_url: null,
              }
            : img
        )
      );

      // Reset crop box to default
      if (imageDimensions.width) {
        const defaultWidth = Math.min(imageDimensions.width * 0.4, 400);
        setCropBox({
          x: (imageDimensions.width - defaultWidth) / 2,
          y: 20,
          width: defaultWidth,
          height: defaultWidth,
        });
      }

      toast({ title: "Crop reset", description: "You can now redo the crop." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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

      // Expanded image is the new source - clear any existing crop data
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
        .eq("id", currentImage.id);

      // Set flag BEFORE updating state so handleImageLoad uses defaults for new image
      setForceDefaultCrop(true);

      // Update local state with new source URL and cleared crop data
      setSourceImages((prev) =>
        prev.map((img) =>
          img.id === currentImage.id
            ? {
                ...img,
                source_url: expandedUrl,
                head_crop_x: null,
                head_crop_y: null,
                head_crop_width: null,
                head_crop_height: null,
                head_cropped_url: null,
              }
            : img
        )
      );

      // Reset crop box to default (will be recalculated on image load)
      setCropBox({ x: 0, y: 0, width: 200, height: 200 });

      toast({
        title: "Image expanded",
        description: "Added 20% white space to top. Please reposition the crop box.",
      });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setExpanding(false);
    }
  };

  const handleExpandAllImages = async () => {
    // Get all source images that haven't been cropped yet
    const imagesToExpand = sourceImages.filter(img => !img.head_cropped_url);
    
    if (imagesToExpand.length === 0) {
      toast({ title: "Nothing to expand", description: "All images already have crops." });
      return;
    }
    
    setExpandingAll(true);
    setExpandProgress({ current: 0, total: imagesToExpand.length });
    
    let successCount = 0;
    for (let i = 0; i < imagesToExpand.length; i++) {
      const img = imagesToExpand[i];
      setExpandProgress({ current: i + 1, total: imagesToExpand.length });
      
      try {
        const response = await supabase.functions.invoke("expand-image-top", {
          body: {
            imageUrl: img.source_url,
            imageId: img.id,
            paddingPercent: 20,
          },
        });
        
        if (!response.error && response.data?.expandedUrl) {
          successCount++;
          const expandedUrl = response.data.expandedUrl;
          
          // Clear crop data in database for expanded image
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
            .eq("id", img.id);
          
          // Update local state with new URL
          setSourceImages(prev => prev.map(s => 
            s.id === img.id 
              ? { 
                  ...s, 
                  source_url: expandedUrl,
                  head_crop_x: null,
                  head_crop_y: null,
                  head_crop_width: null,
                  head_crop_height: null,
                  head_cropped_url: null,
                }
              : s
          ));
        }
      } catch (e) {
        console.error(`Failed to expand image ${img.id}:`, e);
      }
    }
    
    setExpandingAll(false);
    setForceDefaultCrop(true);
    toast({
      title: "Bulk expansion complete",
      description: `Expanded ${successCount} of ${imagesToExpand.length} images.`
    });
  };

  const handleIgnoreLook = async () => {
    if (!lookId) return;
    
    setIgnoringLook(true);
    try {
      // Get all unique views for this look
      const views = [...new Set(sourceImages.map(img => img.view))];
      
      // Mark each view as 'completed' for the 'crop' tab
      await Promise.all(
        views.map(view => 
          workflowState.updateViewState(lookId, view, 'crop', 'completed', 'user_ignored')
        )
      );
      
      toast({
        title: "Look skipped",
        description: `Marked ${views.length} views as complete.`,
      });
      
      // Auto-advance to next look needing action
      const nextLook = looks.find(l => 
        l.id !== lookId && lookNeedsActionForTab(workflowState.lookStates, l.id, 'crop')
      );
      if (nextLook) {
        onLookChange(nextLook.id);
      }
    } catch (error) {
      console.error('Error ignoring look:', error);
      toast({
        title: "Error",
        description: "Failed to skip look",
        variant: "destructive",
      });
    } finally {
      setIgnoringLook(false);
    }
  };

  const allCropped = sourceImages.every((img) => img.head_cropped_url);

  // Filter source images based on workflow filter mode
  const filteredSourceImages = useMemo(() => {
    if (workflowState.filterMode === 'all') return sourceImages;
    
    return sourceImages.filter(img => {
      const isComplete = isViewComplete(workflowState.lookStates, img.look_id, img.view, 'crop');
      return !isComplete;
    });
  }, [sourceImages, workflowState.filterMode, workflowState.lookStates]);

  // Split source images into needs action and completed
  const { needsActionImages, completedImages } = useMemo(() => {
    const needsAction: LookSourceImage[] = [];
    const completed: LookSourceImage[] = [];

    for (const img of sourceImages) {
      const isComplete = isViewComplete(workflowState.lookStates, img.look_id, img.view, 'crop');
      if (isComplete) {
        completed.push(img);
      } else {
        needsAction.push(img);
      }
    }

    return { needsActionImages: needsAction, completedImages: completed };
  }, [sourceImages, workflowState.lookStates]);

  // Calculate crop box position using CACHED bounds for consistency
  const getCropStyle = () => {
    if (!cachedBounds) return {};
    
    return {
      left: cachedBounds.offsetX + cropBox.x / cachedBounds.scaleX,
      top: cachedBounds.offsetY + cropBox.y / cachedBounds.scaleY,
      width: cropBox.width / cachedBounds.scaleX,
      height: cropBox.height / cachedBounds.scaleY,
    };
  };

  // Canvas-based live preview - draws the cropped selection centered with white background
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !currentImage || currentImage.head_cropped_url) return;
    if (!imageReady || !imageDimensions.width || !cropBox.width || !cropBox.height) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const previewSize = 160;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      // Fill with white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, previewSize, previewSize);

      // Calculate scale to fit the crop box while preserving aspect ratio
      const scale = Math.min(previewSize / cropBox.width, previewSize / cropBox.height);
      
      // Destination dimensions
      const destW = cropBox.width * scale;
      const destH = cropBox.height * scale;
      
      // Center the crop in the preview
      const destX = (previewSize - destW) / 2;
      const destY = (previewSize - destH) / 2;

      // Draw the cropped portion of the source image
      ctx.drawImage(
        img,
        cropBox.x, cropBox.y, cropBox.width, cropBox.height, // source rect
        destX, destY, destW, destH // destination rect
      );
    };

    img.onerror = () => {
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(0, 0, previewSize, previewSize);
      ctx.fillStyle = '#888';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Preview error', previewSize / 2, previewSize / 2);
    };

    img.src = currentImage.source_url;
  }, [currentImage, imageReady, imageDimensions, cropBox]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-6">
        {/* Left: Thumbnails */}
        <Card>
          <CardHeader>
            <CardTitle>Source Images</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Needs Action Section */}
            {needsActionImages.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-amber-600">
                  <AlertCircle className="h-3 w-3" />
                  Needs Cropping ({needsActionImages.length})
                </div>
                {needsActionImages.map((img) => {
                  const originalIndex = sourceImages.findIndex(s => s.id === img.id);
                  return (
                    <button
                      key={img.id}
                      onClick={() => setSelectedIndex(originalIndex)}
                      className={`
                        w-full flex items-center gap-3 p-2 rounded-lg transition-colors
                        ${originalIndex === selectedIndex ? "bg-primary/10 border border-primary" : "hover:bg-muted"}
                      `}
                    >
                      <img
                        src={img.source_url}
                        alt={img.view}
                        className="w-12 h-16 object-cover rounded"
                      />
                      <div className="flex-1 text-left">
                        <p className="font-medium capitalize">{img.view}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Completed Section */}
            {workflowState.filterMode === 'all' && completedImages.length > 0 && (
              <div className="space-y-2 border-t pt-3 mt-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Check className="h-3 w-3 text-emerald-500" />
                  Completed ({completedImages.length})
                </div>
                <div className="opacity-60">
                  {completedImages.map((img) => {
                    const originalIndex = sourceImages.findIndex(s => s.id === img.id);
                    return (
                      <button
                        key={img.id}
                        onClick={() => setSelectedIndex(originalIndex)}
                        className={`
                          w-full flex items-center gap-3 p-2 rounded-lg transition-colors
                          ${originalIndex === selectedIndex ? "bg-secondary border border-border" : "hover:bg-muted/50"}
                        `}
                      >
                        <img
                          src={img.source_url}
                          alt={img.view}
                          className="w-12 h-16 object-cover rounded"
                        />
                        <div className="flex-1 text-left">
                          <p className="font-medium capitalize">{img.view}</p>
                          <p className="text-xs text-emerald-600 flex items-center gap-1">
                            <Check className="h-3 w-3" /> Cropped
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Empty state */}
            {needsActionImages.length === 0 && workflowState.filterMode === 'needs_action' && (
              <div className="text-center py-4 text-sm text-muted-foreground">
                <Check className="h-5 w-5 mx-auto mb-2 text-emerald-500" />
                All images cropped for this look!
              </div>
            )}
          </CardContent>

          {/* Looks Quick Switcher with filtering */}
          {looks.length > 0 && (
            <div className="border-t p-3">
              <p className="text-xs text-muted-foreground mb-2">Switch Look</p>
              <LooksSwitcher
                looks={looks}
                selectedLookId={lookId}
                tab="crop"
                onLookChange={onLookChange}
              />
            </div>
          )}
        </Card>

        {/* Center: Crop Editor */}
        <Card className="col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle>Crop Head Region</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExpandAllImages}
                disabled={expandingAll || processing || expanding}
              >
                <Plus className="h-4 w-4 mr-1" />
                {expandingAll 
                  ? `Expanding ${expandProgress.current}/${expandProgress.total}...` 
                  : "Expand All Images"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleIgnoreLook}
                disabled={ignoringLook || !lookId}
              >
                <ArrowRight className="h-4 w-4 mr-1" />
                {ignoringLook ? "Skipping..." : "Skip Look"}
              </Button>
            </div>
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
                  {/* Crop overlay (green box = bottom half of output) - only show when ready */}
                  {imageReady && imageDimensions.width > 0 && cropBox.width > 0 && (
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
                  )}
                </div>

                <div className="flex flex-col gap-3">
                  <p className="text-sm text-muted-foreground">
                    <span className="text-green-600 font-medium">Green box</span> = your selection (becomes bottom half). 
                    Top half will be white padding. Output: {OUTPUT_SIZE}×{OUTPUT_SIZE}px
                  </p>
                  <div className="flex justify-end gap-2">
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
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">
                      {currentImage.head_cropped_url ? "Saved Result" : "Live Preview"} ({OUTPUT_SIZE}×{OUTPUT_SIZE} output):
                    </p>
                    {currentImage.head_cropped_url && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleResetCrop}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Reset Crop
                      </Button>
                    )}
                  </div>
                  <div className="relative w-40 h-40 overflow-hidden rounded border bg-white">
                    {currentImage.head_cropped_url ? (
                      <img
                        src={currentImage.head_cropped_url}
                        alt="Cropped result"
                        className="w-full h-full object-contain"
                        draggable={false}
                      />
                    ) : (
                      <canvas
                        ref={previewCanvasRef}
                        width={160}
                        height={160}
                        className="w-full h-full"
                      />
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
