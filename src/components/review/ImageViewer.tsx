import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, Maximize2, Eye, EyeOff } from 'lucide-react';
import { ImageAnnotation, AnnotationRect } from '@/types/review';
import { cn } from '@/lib/utils';

interface ImageViewerProps {
  src: string;
  alt?: string;
  annotations: ImageAnnotation[];
  selectedAnnotationId: string | null;
  onAnnotationClick: (annotation: ImageAnnotation) => void;
  onAnnotationCreate: (rect: AnnotationRect) => void;
  isDrawing: boolean;
  showAnnotations: boolean;
  onToggleAnnotations: () => void;
  className?: string;
}

export function ImageViewer({
  src,
  alt = 'Asset',
  annotations,
  selectedAnnotationId,
  onAnnotationClick,
  onAnnotationCreate,
  isDrawing,
  showAnnotations,
  onToggleAnnotations,
  className,
}: ImageViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  const handleZoomIn = () => setZoom(prev => Math.min(prev * 1.25, 5));
  const handleZoomOut = () => setZoom(prev => Math.max(prev / 1.25, 0.25));
  const handleFit = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Get normalized coordinates relative to the natural image size
  const getNormalizedCoords = useCallback((clientX: number, clientY: number) => {
    if (!imageRef.current) return null;
    const rect = imageRef.current.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isDrawing) {
      const coords = getNormalizedCoords(e.clientX, e.clientY);
      if (coords) {
        setDrawStart(coords);
        setDrawCurrent(coords);
      }
    } else if (e.button === 0 && zoom > 1) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [isDrawing, getNormalizedCoords, zoom, pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (drawStart && isDrawing) {
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
  }, [drawStart, isDrawing, getNormalizedCoords, isPanning, panStart]);

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

  // Reset on image change
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setImageLoaded(false);
  }, [src]);

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

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 border-b border-border bg-card">
        <Button variant="ghost" size="icon" onClick={handleZoomOut}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground w-12 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <Button variant="ghost" size="icon" onClick={handleZoomIn}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleFit}>
          <Maximize2 className="h-4 w-4" />
        </Button>
        <div className="flex-1" />
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onToggleAnnotations}
          className="gap-2"
        >
          {showAnnotations ? (
            <><Eye className="h-4 w-4" /> Annotations</>
          ) : (
            <><EyeOff className="h-4 w-4" /> Annotations</>
          )}
        </Button>
      </div>

      {/* Image Container */}
      <div 
        ref={containerRef}
        className={cn(
          "flex-1 overflow-hidden relative bg-muted/30",
          isDrawing && "cursor-crosshair",
          isPanning && "cursor-grabbing"
        )}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div 
          className="absolute inset-0 flex items-center justify-center"
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
              className="max-h-full max-w-full object-contain select-none"
              draggable={false}
              onLoad={() => setImageLoaded(true)}
            />
            
            {/* Annotations Overlay */}
            {imageLoaded && showAnnotations && (
              <div className="absolute inset-0 pointer-events-none">
                {annotations.map((ann) => (
                  <div
                    key={ann.id}
                    className={cn(
                      "absolute border-2 rounded-lg cursor-pointer pointer-events-auto transition-all",
                      selectedAnnotationId === ann.id
                        ? "border-primary bg-primary/20 shadow-lg shadow-primary/30"
                        : "border-orange-400 bg-orange-400/10 hover:bg-orange-400/20"
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
                  >
                    <div className="absolute -top-5 left-1 text-xs bg-background/80 px-1 rounded">
                      #{annotations.indexOf(ann) + 1}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Drawing Preview */}
            {imageLoaded && drawingRect && (
              <div
                className="absolute border-2 border-dashed border-primary bg-primary/10 rounded-lg pointer-events-none"
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
      </div>
    </div>
  );
}
