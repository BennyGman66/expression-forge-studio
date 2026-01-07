import { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useDroppable } from '@dnd-kit/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Maximize2, Trash2, Link2 } from 'lucide-react';
import { Identity, IdentityImage } from './types';
import { ModelImage } from './ModelImage';
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
  onUpdateName?: (newName: string) => Promise<void>;
  onLinkToTwin?: () => void;
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
  onUpdateName,
  onLinkToTwin,
}: ModelColumnProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(identity.name);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync editedName when identity changes
  useEffect(() => {
    setEditedName(identity.name);
  }, [identity.name]);

  const handleSaveName = useCallback(async () => {
    if (editedName.trim() && editedName !== identity.name && onUpdateName) {
      await onUpdateName(editedName.trim());
    }
    setIsEditingName(false);
  }, [editedName, identity.name, onUpdateName]);

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
          className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {isEditingName ? (
              <Input
                ref={inputRef}
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveName();
                  }
                  if (e.key === 'Escape') {
                    setEditedName(identity.name);
                    setIsEditingName(false);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                autoFocus
                className="h-6 text-sm px-1 flex-1"
              />
            ) : (
              <span 
                className="font-medium text-sm cursor-text hover:bg-muted/50 px-1 rounded truncate"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditingName(true);
                }}
                title={identity.name}
              >
                {identity.name}
              </span>
            )}
          </div>
          {identity.digital_talent && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
              <Link2 className="h-2.5 w-2.5" />
              {identity.digital_talent.name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {selectedInColumn > 0 && (
            <Badge variant="default" className="text-xs">
              {selectedInColumn}
            </Badge>
          )}
          <Badge variant="secondary" className="text-xs">
            {images.length}
          </Badge>
        </div>

        {/* Dropdown Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              onClick={e => e.stopPropagation()}
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={onExpand}>
              <Maximize2 className="h-4 w-4 mr-2" />
              Expand View
            </DropdownMenuItem>
            {onLinkToTwin && (
              <DropdownMenuItem onClick={onLinkToTwin}>
                <Link2 className="h-4 w-4 mr-2" />
                Link to Twin
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Model
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
