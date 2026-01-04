import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, Maximize2, Eye, EyeOff, Target } from 'lucide-react';
import { ImageAnnotation, AnnotationRect } from '@/types/review';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { format } from 'date-fns';

interface ImageViewerProps {
  src: string;
  alt?: string;
  annotations: ImageAnnotation[];
  selectedAnnotationId: string | null;
  flashingAnnotationId?: string | null;
  onAnnotationClick: (annotation: ImageAnnotation) => void;
  onAnnotationCreate: (rect: AnnotationRect) => void;
  isDrawing: boolean;
  showAnnotations: boolean;
  onToggleAnnotations: () => void;
  className?: string;
  readOnly?: boolean; // Disables drawing but still shows annotations
}

export interface ImageViewerHandle {
  scrollToAnnotation: (annotationId: string) => void;
  fitToScreen: () => void;
}

export const ImageViewer = forwardRef<ImageViewerHandle, ImageViewerProps>(
  function ImageViewer(
    {
      src,
      alt = 'Asset',
      annotations,
      selectedAnnotationId,
      flashingAnnotationId,
      onAnnotationClick,
      onAnnotationCreate,
      isDrawing,
      showAnnotations,
      onToggleAnnotations,
      className,
      readOnly = false,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
    const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
    const [hoveredAnnotationId, setHoveredAnnotationId] = useState<string | null>(null);
    const [prevSrc, setPrevSrc] = useState<string | null>(null);
    const [isTransitioning, setIsTransitioning] = useState(false);

    const handleZoomIn = () => setZoom(prev => Math.min(prev * 1.25, 5));
    const handleZoomOut = () => setZoom(prev => Math.max(prev / 1.25, 0.25));

    // Fit entire image in viewport - no cropping
    const handleFit = useCallback(() => {
      if (!containerRef.current || !imageDimensions.width) {
        setZoom(1);
        setPan({ x: 0, y: 0 });
        return;
      }
      
      const container = containerRef.current.getBoundingClientRect();
      const padding = 16; // Minimal padding
      const availableWidth = container.width - padding;
      const availableHeight = container.height - padding;
      
      // Always use the smaller ratio to ensure full image fits
      const fitZoom = Math.min(
        availableWidth / imageDimensions.width,
        availableHeight / imageDimensions.height
      );
      
      // No minimum floor - let it be as small as needed to show full image
      setZoom(fitZoom);
      setPan({ x: 0, y: 0 });
    }, [imageDimensions]);

    // Scroll/zoom to center on a specific annotation
    const scrollToAnnotation = useCallback((annotationId: string) => {
      const annotation = annotations.find(a => a.id === annotationId);
      if (!annotation || !containerRef.current || !imageDimensions.width) return;
      
      const container = containerRef.current.getBoundingClientRect();
      
      // Calculate annotation center in image coordinates
      const annCenterX = (annotation.rect.x + annotation.rect.w / 2) * imageDimensions.width;
      const annCenterY = (annotation.rect.y + annotation.rect.h / 2) * imageDimensions.height;
      
      // Calculate zoom to show annotation at ~40% of viewport
      const annWidth = annotation.rect.w * imageDimensions.width;
      const annHeight = annotation.rect.h * imageDimensions.height;
      const targetZoom = Math.min(
        (container.width * 0.4) / annWidth,
        (container.height * 0.4) / annHeight,
        3 // Max zoom
      );
      
      // Calculate pan to center annotation
      const newZoom = Math.max(1, targetZoom);
      const panX = (container.width / 2) - (annCenterX * newZoom);
      const panY = (container.height / 2) - (annCenterY * newZoom);
      
      setZoom(newZoom);
      setPan({ x: panX, y: panY });
    }, [annotations, imageDimensions]);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      scrollToAnnotation,
      fitToScreen: handleFit,
    }), [scrollToAnnotation, handleFit]);

    // Get normalized coordinates relative to the natural image size
    const getNormalizedCoords = useCallback((clientX: number, clientY: number) => {
      if (!imageRef.current) return null;
      const rect = imageRef.current.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width;
      const y = (clientY - rect.top) / rect.height;
      return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
      if (isDrawing && !readOnly) {
        const coords = getNormalizedCoords(e.clientX, e.clientY);
        if (coords) {
          setDrawStart(coords);
          setDrawCurrent(coords);
        }
      } else if (e.button === 0) {
        // Allow panning at any zoom level
        setIsPanning(true);
        setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      }
    }, [isDrawing, readOnly, getNormalizedCoords, zoom, pan]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
      if (drawStart && isDrawing && !readOnly) {
        const coords = getNormalizedCoords(e.clientX, e.clientY);
        if (coords) {
          setDrawCurrent(coords);
        }
      } else if (isPanning) {
        setPan({
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        });
      }
    }, [drawStart, isDrawing, readOnly, getNormalizedCoords, isPanning, panStart]);

    const handleMouseUp = useCallback(() => {
      if (drawStart && drawCurrent && isDrawing) {
        const x = Math.min(drawStart.x, drawCurrent.x);
        const y = Math.min(drawStart.y, drawCurrent.y);
        const w = Math.abs(drawCurrent.x - drawStart.x);
        const h = Math.abs(drawCurrent.y - drawStart.y);
        
        // Only create if has meaningful size
        if (w > 0.01 && h > 0.01) {
          onAnnotationCreate({ x, y, w, h });
        }
      }
      setDrawStart(null);
      setDrawCurrent(null);
      setIsPanning(false);
    }, [drawStart, drawCurrent, isDrawing, onAnnotationCreate]);

    // Handle image change with smooth transition (no flash)
    useEffect(() => {
      if (prevSrc && prevSrc !== src) {
        setIsTransitioning(true);
      }
      setPrevSrc(src);
      setImageLoaded(false);
      setImageDimensions({ width: 0, height: 0 });
    }, [src]);

    // Auto-fit when image loads (with slight delay for stable container dimensions)
    useEffect(() => {
      if (imageLoaded && imageDimensions.width > 0) {
        // Double RAF to ensure container is fully rendered and stable
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            handleFit();
          });
        });
      }
    }, [imageLoaded, imageDimensions, handleFit]);

    const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      setImageLoaded(true);
      // End transition after a brief delay to allow fit to apply
      setTimeout(() => setIsTransitioning(false), 50);
    };

    // Calculate drawing rect for preview
    const getDrawingRect = () => {
      if (!drawStart || !drawCurrent) return null;
      return {
        x: Math.min(drawStart.x, drawCurrent.x),
        y: Math.min(drawStart.y, drawCurrent.y),
        w: Math.abs(drawCurrent.x - drawStart.x),
        h: Math.abs(drawCurrent.y - drawStart.y),
      };
    };

    const drawingRect = getDrawingRect();

    // Smart marker positioning (avoid clipping at edges)
    const getMarkerPosition = (ann: ImageAnnotation) => {
      const isNearTop = ann.rect.y < 0.08;
      const isNearLeft = ann.rect.x < 0.05;
      const isNearRight = ann.rect.x + ann.rect.w > 0.95;
      
      let top = isNearTop ? `${ann.rect.h * 100}%` : '-20px';
      let left = isNearLeft ? '0' : isNearRight ? 'auto' : '4px';
      let right = isNearRight ? '0' : 'auto';
      let bottom = isNearTop ? '4px' : 'auto';
      
      return { top: isNearTop ? 'auto' : top, left, right, bottom };
    };

    return (
      <TooltipProvider>
        <div className={cn("flex flex-col h-full", className)}>

          {/* Image Container */}
          <div 
            ref={containerRef}
            className={cn(
              "flex-1 overflow-hidden relative bg-muted/30",
              isDrawing && "cursor-crosshair",
              isPanning && "cursor-grabbing",
              !isDrawing && !isPanning && "cursor-grab"
            )}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <div 
              className="absolute inset-0 flex items-center justify-center p-4"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
              }}
            >
              <div className="relative inline-block">
                <img
                  ref={imageRef}
                  src={src}
                  alt={alt}
                  className={cn(
                    "max-h-full max-w-full object-contain select-none transition-opacity duration-150",
                    isTransitioning && !imageLoaded ? "opacity-0" : "opacity-100"
                  )}
                  draggable={false}
                  onLoad={handleImageLoad}
                />
                
                {/* Annotations Overlay */}
                {imageLoaded && showAnnotations && (
                  <div className="absolute inset-0 pointer-events-none">
                    {annotations.map((ann, idx) => {
                      const isSelected = selectedAnnotationId === ann.id;
                      const isHovered = hoveredAnnotationId === ann.id;
                      const isFlashing = flashingAnnotationId === ann.id;
                      const markerPos = getMarkerPosition(ann);
                      const hasThread = !!ann.thread;
                      
                      return (
                        <Tooltip key={ann.id} open={isHovered && !isSelected}>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                "absolute border-2 rounded-lg cursor-pointer pointer-events-auto transition-all duration-200",
                                isFlashing && "animate-flash-highlight",
                                isSelected
                                  ? "border-primary bg-primary/20 shadow-lg shadow-primary/40 ring-2 ring-primary/30"
                                  : hasThread
                                    ? "border-orange-400 bg-orange-400/10 hover:bg-orange-400/20 hover:border-orange-300"
                                    : "border-dashed border-muted-foreground/50 bg-muted/10 hover:border-muted-foreground"
                              )}
                              style={{
                                left: `${ann.rect.x * 100}%`,
                                top: `${ann.rect.y * 100}%`,
                                width: `${ann.rect.w * 100}%`,
                                height: `${ann.rect.h * 100}%`,
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                onAnnotationClick(ann);
                              }}
                              onMouseEnter={() => setHoveredAnnotationId(ann.id)}
                              onMouseLeave={() => setHoveredAnnotationId(null)}
                            >
                              {/* Annotation Marker */}
                              <div 
                                className={cn(
                                  "absolute text-xs px-1.5 py-0.5 rounded font-medium transition-all",
                                  isSelected
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-background/90 text-foreground border border-border"
                                )}
                                style={markerPos}
                              >
                                #{idx + 1}
                              </div>
                              
                              {/* Selection pulse animation */}
                              {isSelected && (
                                <div className="absolute inset-0 rounded-lg animate-pulse bg-primary/10 pointer-events-none" />
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-[200px]">
                            <div className="text-xs space-y-1">
                              <div className="font-medium flex items-center gap-1">
                                <span>#{idx + 1}</span>
                                {ann.created_by && (
                                  <span className="text-muted-foreground">
                                    by {ann.created_by.display_name || ann.created_by.email?.split('@')[0]}
                                  </span>
                                )}
                              </div>
                              {ann.thread?.comments?.[0] && (
                                <p className="text-muted-foreground line-clamp-2">
                                  {ann.thread.comments[0].body}
                                </p>
                              )}
                              {ann.created_at && (
                                <p className="text-[10px] text-muted-foreground">
                                  {format(new Date(ann.created_at), 'MMM d, h:mm a')}
                                </p>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                )}

                {/* Drawing Preview */}
                {imageLoaded && drawingRect && (
                  <div
                    className="absolute border-2 border-dashed border-primary bg-primary/10 rounded-lg pointer-events-none animate-pulse"
                    style={{
                      left: `${drawingRect.x * 100}%`,
                      top: `${drawingRect.y * 100}%`,
                      width: `${drawingRect.w * 100}%`,
                      height: `${drawingRect.h * 100}%`,
                    }}
                  />
                )}
              </div>
            </div>

          {/* Drawing hint */}
            {isDrawing && !drawStart && !readOnly && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-muted-foreground bg-background/80 backdrop-blur px-3 py-1.5 rounded-full border border-border">
                Click and drag to draw an annotation
              </div>
            )}

            {/* Bottom Floating Toolbar */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-background/90 backdrop-blur border border-border rounded-full px-2 py-1 shadow-lg">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomOut}>
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground w-10 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomIn}>
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <div className="w-px h-4 bg-border mx-1" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleFit}>
                    <Maximize2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Fit to screen</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7"
                    onClick={onToggleAnnotations}
                  >
                    {showAnnotations ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{showAnnotations ? 'Hide annotations' : 'Show annotations'}</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </TooltipProvider>
    );
  }
);
