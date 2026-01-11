import { useState, useEffect, useRef, memo } from "react";
import { ImageIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getImageUrl, ImageTier } from "@/lib/imageUtils";
import { cn } from "@/lib/utils";

interface OptimizedImageProps {
  src: string | null | undefined;
  alt?: string;
  tier?: ImageTier;
  className?: string;
  containerClassName?: string;
  aspectRatio?: string;
  rootMargin?: string;
  showPlaceholder?: boolean;
  onLoad?: () => void;
  onError?: () => void;
}

/**
 * OptimizedImage - A reusable image component with:
 * - Lazy loading via IntersectionObserver
 * - Tiered image sizing for optimal bandwidth
 * - Skeleton placeholder during load
 * - Smooth fade-in transition
 * - Error fallback with placeholder icon
 */
export const OptimizedImage = memo(function OptimizedImage({
  src,
  alt = "",
  tier = "thumb",
  className,
  containerClassName,
  aspectRatio,
  rootMargin = "100px",
  showPlaceholder = true,
  onLoad,
  onError,
}: OptimizedImageProps) {
  const [isInView, setIsInView] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Set up IntersectionObserver for lazy loading
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [rootMargin]);

  // Reset states when src changes
  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);
  }, [src]);

  const optimizedUrl = getImageUrl(src, tier);

  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setHasError(true);
    onError?.();
  };

  // No source provided
  if (!src) {
    if (!showPlaceholder) return null;
    return (
      <div
        ref={containerRef}
        className={cn(
          "flex items-center justify-center bg-muted",
          containerClassName
        )}
        style={{ aspectRatio }}
      >
        <ImageIcon className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden", containerClassName)}
      style={{ aspectRatio }}
    >
      {/* Skeleton placeholder */}
      {!isLoaded && !hasError && (
        <Skeleton className="absolute inset-0 w-full h-full" />
      )}

      {/* Error fallback */}
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
        </div>
      )}

      {/* Actual image - only render when in view */}
      {isInView && !hasError && (
        <img
          src={optimizedUrl}
          alt={alt}
          loading="lazy"
          onLoad={handleLoad}
          onError={handleError}
          className={cn(
            "w-full h-full object-cover transition-opacity duration-300",
            isLoaded ? "opacity-100" : "opacity-0",
            className
          )}
        />
      )}
    </div>
  );
});

export default OptimizedImage;
