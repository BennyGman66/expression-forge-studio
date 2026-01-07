import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { getImageUrl, ImageTier } from '@/lib/imageUtils';
import { cn } from '@/lib/utils';

interface ModelImageProps {
  id: string;
  imageUrl: string | null;
  isSelected: boolean;
  onSelect: (event: React.MouseEvent) => void;
  onToggle: () => void;
  size?: ImageTier;
  identityId: string;
  scrapeImageId: string;
}

export const ModelImage = memo(function ModelImage({
  id,
  imageUrl,
  isSelected,
  onSelect,
  onToggle,
  size = 'thumb',
  identityId,
  scrapeImageId,
}: ModelImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Intersection Observer for lazy loading
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.unobserve(element);
          }
        });
      },
      { rootMargin: '100px' }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `image-${id}`,
    data: {
      type: 'image',
      imageId: id,
      identityImageId: id,
      sourceIdentityId: identityId,
      scrapeImageId,
      imageUrl,
    },
  });

  // Combine refs properly
  const setRefs = useCallback((node: HTMLDivElement | null) => {
    setNodeRef(node);
    containerRef.current = node;
  }, [setNodeRef]);

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 100 : undefined,
        opacity: isDragging ? 0.5 : 1,
      }
    : undefined;

  return (
    <div
      ref={setRefs}
      style={style}
      className={cn(
        'relative rounded-md overflow-hidden border-2 transition-all cursor-grab active:cursor-grabbing',
        isSelected
          ? 'border-primary ring-2 ring-primary/20'
          : 'border-transparent hover:border-muted-foreground/30',
        isDragging && 'shadow-lg'
      )}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      {...listeners}
      {...attributes}
    >
      {/* Checkbox - visual only */}
      <div
        className={cn(
          'absolute top-1.5 left-1.5 z-10 transition-opacity pointer-events-none',
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        )}
      >
        <Checkbox
          checked={isSelected}
          className="bg-background/90 border-background shadow-sm"
        />
      </div>

      {/* Image */}
      <div className="aspect-[3/4] bg-muted">
        {isVisible ? (
          <>
            {!isLoaded && <Skeleton className="absolute inset-0" />}
            <img
              src={getImageUrl(imageUrl, size)}
              alt=""
              className={cn(
                'w-full h-full object-cover transition-opacity',
                isLoaded ? 'opacity-100' : 'opacity-0'
              )}
              loading="lazy"
              onLoad={() => setIsLoaded(true)}
            />
          </>
        ) : (
          <Skeleton className="absolute inset-0" />
        )}
      </div>
    </div>
  );
});
