import { useRef, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useDroppable } from '@dnd-kit/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { User, Maximize2, Trash2 } from 'lucide-react';
import { Identity, IdentityImage } from './types';
import { ModelImage } from './ModelImage';
import { getImageUrl } from '@/lib/imageUtils';
import { cn } from '@/lib/utils';

const IMAGES_PER_ROW = 2;
const ROW_HEIGHT = 150;
const COLUMN_WIDTH = 220;

interface ModelColumnProps {
  identity: Identity;
  images: IdentityImage[];
  isExpanded: boolean;
  selectedImageIds: Set<string>;
  onImageSelect: (imageId: string, event: React.MouseEvent) => void;
  onImageToggle: (imageId: string) => void;
  onExpand: () => void;
  onDelete: () => void;
  onSelectAllImages: () => void;
  isSelected: boolean;
  onToggleColumnSelect: () => void;
  isDragOver?: boolean;
}

export function ModelColumn({
  identity,
  images,
  isExpanded,
  selectedImageIds,
  onImageSelect,
  onImageToggle,
  onExpand,
  onDelete,
  onSelectAllImages,
  isSelected,
  onToggleColumnSelect,
  isDragOver,
}: ModelColumnProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { setNodeRef, isOver } = useDroppable({
    id: `column-${identity.id}`,
    data: {
      type: 'column',
      identityId: identity.id,
    },
  });

  // Calculate rows for virtualization
  const rows = useMemo(() => {
    const result: IdentityImage[][] = [];
    for (let i = 0; i < images.length; i += IMAGES_PER_ROW) {
      result.push(images.slice(i, i + IMAGES_PER_ROW));
    }
    return result;
  }, [images]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 3,
  });

  const selectedInColumn = useMemo(() => {
    return images.filter(img => selectedImageIds.has(img.id)).length;
  }, [images, selectedImageIds]);

  const handleHeaderClick = useCallback((e: React.MouseEvent) => {
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      onSelectAllImages();
    }
  }, [onSelectAllImages]);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col rounded-lg border bg-card transition-all',
        isExpanded ? 'w-[360px]' : 'w-[220px]',
        isSelected && 'ring-2 ring-primary',
        (isOver || isDragOver) && 'ring-2 ring-primary bg-primary/5',
        'flex-shrink-0'
      )}
      style={{ minWidth: isExpanded ? 360 : COLUMN_WIDTH }}
    >
      {/* Column Header */}
      <div
        className="p-3 border-b border-border flex items-center gap-2 cursor-pointer group"
        onClick={handleHeaderClick}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleColumnSelect()}
          onClick={e => e.stopPropagation()}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        />

        <Avatar className="h-8 w-8 flex-shrink-0">
          {identity.representative_image_url ? (
            <AvatarImage
              src={getImageUrl(identity.representative_image_url, 'tiny')}
              alt={identity.name}
              className="object-cover"
            />
          ) : null}
          <AvatarFallback>
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-sm truncate">{identity.name}</span>
            {identity.digital_talent && (
              <Badge variant="outline" className="text-[9px] px-1 flex-shrink-0">
                {identity.digital_talent.name}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {selectedInColumn > 0 && (
            <Badge variant="default" className="text-xs">
              {selectedInColumn}
            </Badge>
          )}
          <Badge variant="secondary" className="text-xs">
            {images.length}
          </Badge>
        </div>

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={e => {
              e.stopPropagation();
              onExpand();
            }}
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={e => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Virtualized Image Grid */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-2"
        style={{ maxHeight: 'calc(100vh - 280px)' }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map(virtualRow => {
            const rowImages = rows[virtualRow.index];
            return (
              <div
                key={virtualRow.index}
                className="absolute top-0 left-0 w-full flex gap-2"
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {rowImages.map(image => (
                  <div key={image.id} className="flex-1 group">
                    <ModelImage
                      id={image.id}
                      imageUrl={image.scrape_image?.stored_url || image.scrape_image?.source_url || null}
                      isSelected={selectedImageIds.has(image.id)}
                      onSelect={e => onImageSelect(image.id, e)}
                      onToggle={() => onImageToggle(image.id)}
                      size={isExpanded ? 'preview' : 'thumb'}
                      identityId={identity.id}
                      scrapeImageId={image.scrape_image_id}
                    />
                  </div>
                ))}
                {/* Fill empty slots */}
                {rowImages.length < IMAGES_PER_ROW &&
                  Array.from({ length: IMAGES_PER_ROW - rowImages.length }).map((_, i) => (
                    <div key={`empty-${i}`} className="flex-1" />
                  ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
