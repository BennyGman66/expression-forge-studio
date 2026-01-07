import { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { Badge } from '@/components/ui/badge';
import { ModelColumn } from './ModelColumn';
import { BulkActionBar } from './BulkActionBar';
import { MoveToModelDialog } from './MoveToModelDialog';
import { SplitToNewDialog } from './SplitToNewDialog';
import { Identity, IdentityImage, DragData } from './types';
import { getImageUrl } from '@/lib/imageUtils';

const COLUMN_WIDTH = 244; // 220 + gap
const COLUMN_GAP = 24;

interface ModelColumnViewProps {
  identities: Identity[];
  imagesByIdentity: Record<string, IdentityImage[]>;
  selectedImageIds: Set<string>;
  onImageSelect: (imageId: string, event: React.MouseEvent) => void;
  onImageToggle: (imageId: string) => void;
  onClearSelection: () => void;
  onSelectAllInColumn: (imageIds: string[]) => void;
  onMoveImages: (imageIds: string[], sourceId: string, targetId: string) => Promise<void>;
  onSplitImages: (imageIds: string[], sourceId: string, customName?: string) => Promise<void>;
  onMergeModels: (sourceIds: string[], targetId: string) => Promise<void>;
  onDeleteImages: (imageIds: string[]) => Promise<void>;
  onDeleteModel: (identityId: string) => void;
  onUpdateModelName: (identityId: string, newName: string) => Promise<void>;
  onLinkToTwin?: (identityId: string) => void;
  selectedModelIds: Set<string>;
  onToggleModelSelect: (identityId: string) => void;
  isOperating: boolean;
}

export function ModelColumnView({
  identities,
  imagesByIdentity,
  selectedImageIds,
  onImageSelect,
  onImageToggle,
  onClearSelection,
  onSelectAllInColumn,
  onMoveImages,
  onSplitImages,
  onMergeModels,
  onDeleteImages,
  onDeleteModel,
  onUpdateModelName,
  onLinkToTwin,
  selectedModelIds,
  onToggleModelSelect,
  isOperating,
}: ModelColumnViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [activeDrag, setActiveDrag] = useState<DragData | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Get source identity IDs for selected images
  const sourceIdentityIds = useMemo(() => {
    const ids = new Set<string>();
    selectedImageIds.forEach(imageId => {
      for (const [identityId, images] of Object.entries(imagesByIdentity)) {
        if (images.some(img => img.id === imageId)) {
          ids.add(identityId);
          break;
        }
      }
    });
    return ids;
  }, [selectedImageIds, imagesByIdentity]);

  // Column virtualizer
  const columnVirtualizer = useVirtualizer({
    count: identities.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => COLUMN_WIDTH,
    horizontal: true,
    overscan: 2,
  });

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as DragData;
    setActiveDrag(data);
  }, []);

  const handleDragOver = useCallback((event: any) => {
    const overId = event.over?.id as string | null;
    if (overId?.startsWith('column-')) {
      setDragOverColumnId(overId.replace('column-', ''));
    } else {
      setDragOverColumnId(null);
    }
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { over } = event;
    setActiveDrag(null);
    setDragOverColumnId(null);

    if (!over || !activeDrag) return;

    const overId = over.id as string;
    if (!overId.startsWith('column-')) return;

    const targetIdentityId = overId.replace('column-', '');
    const sourceIdentityId = activeDrag.sourceIdentityId;

    if (targetIdentityId === sourceIdentityId) return;

    // Move the dragged image(s)
    const imageIds = selectedImageIds.has(activeDrag.imageId)
      ? Array.from(selectedImageIds)
      : [activeDrag.imageId];

    await onMoveImages(imageIds, sourceIdentityId, targetIdentityId);
    onClearSelection();
  }, [activeDrag, selectedImageIds, onMoveImages, onClearSelection]);

  const handleMoveClick = useCallback(() => {
    setMoveDialogOpen(true);
  }, []);

  const handleMoveToModel = useCallback(async (targetIdentityId: string) => {
    const imageIds = Array.from(selectedImageIds);
    const sourceId = Array.from(sourceIdentityIds)[0];
    await onMoveImages(imageIds, sourceId, targetIdentityId);
    onClearSelection();
    setMoveDialogOpen(false);
  }, [selectedImageIds, sourceIdentityIds, onMoveImages, onClearSelection]);

  const handleSplitClick = useCallback(() => {
    setSplitDialogOpen(true);
  }, []);

  const handleSplitConfirm = useCallback(async (customName: string) => {
    const imageIds = Array.from(selectedImageIds);
    const sourceId = Array.from(sourceIdentityIds)[0];
    await onSplitImages(imageIds, sourceId, customName || undefined);
    onClearSelection();
    setSplitDialogOpen(false);
  }, [selectedImageIds, sourceIdentityIds, onSplitImages, onClearSelection]);

  const handleMerge = useCallback(async () => {
    const sourceIds = Array.from(sourceIdentityIds);
    if (sourceIds.length < 2) return;
    const targetId = sourceIds[0];
    await onMergeModels(sourceIds.slice(1), targetId);
    onClearSelection();
  }, [sourceIdentityIds, onMergeModels, onClearSelection]);

  const handleDeleteSelected = useCallback(async () => {
    await onDeleteImages(Array.from(selectedImageIds));
    onClearSelection();
  }, [selectedImageIds, onDeleteImages, onClearSelection]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      if (e.key === 'Escape') {
        onClearSelection();
        setExpandedModelId(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClearSelection]);

  if (identities.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        No models found. Run AI classification first.
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div
        ref={containerRef}
        className="flex-1 overflow-x-auto overflow-y-hidden p-4"
      >
        <div
          className="relative h-full"
          style={{
            width: `${columnVirtualizer.getTotalSize()}px`,
          }}
        >
          {columnVirtualizer.getVirtualItems().map(virtualColumn => {
            const identity = identities[virtualColumn.index];
            const images = imagesByIdentity[identity.id] || [];

            return (
              <div
                key={identity.id}
                style={{
                  position: 'absolute',
                  left: 0,
                  transform: `translateX(${virtualColumn.start}px)`,
                  height: '100%',
                }}
              >
                <ModelColumn
                  identity={identity}
                  images={images}
                  isExpanded={expandedModelId === identity.id}
                  selectedImageIds={selectedImageIds}
                  onImageSelect={onImageSelect}
                  onImageToggle={onImageToggle}
                  onExpand={() => setExpandedModelId(
                    expandedModelId === identity.id ? null : identity.id
                  )}
                  onDelete={() => onDeleteModel(identity.id)}
                  onSelectAllImages={() => onSelectAllInColumn(images.map(i => i.id))}
                  isSelected={selectedModelIds.has(identity.id)}
                  onToggleColumnSelect={() => onToggleModelSelect(identity.id)}
                  isDragOver={dragOverColumnId === identity.id}
                  onUpdateName={(newName) => onUpdateModelName(identity.id, newName)}
                  onLinkToTwin={onLinkToTwin ? () => onLinkToTwin(identity.id) : undefined}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeDrag && (
          <div className="relative">
            <div className="w-24 h-32 rounded-md overflow-hidden border-2 border-primary shadow-xl">
              <img
                src={getImageUrl(activeDrag.imageUrl, 'tiny')}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
            {selectedImageIds.size > 1 && selectedImageIds.has(activeDrag.imageId) && (
              <Badge className="absolute -top-2 -right-2 shadow">
                {selectedImageIds.size}
              </Badge>
            )}
          </div>
        )}
      </DragOverlay>

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedImageIds.size}
        selectedIdentityCount={sourceIdentityIds.size}
        onMove={handleMoveClick}
        onSplit={handleSplitClick}
        onMerge={handleMerge}
        onDelete={handleDeleteSelected}
        onClear={onClearSelection}
        isOperating={isOperating}
      />

      {/* Split Dialog */}
      <SplitToNewDialog
        open={splitDialogOpen}
        onOpenChange={setSplitDialogOpen}
        onConfirm={handleSplitConfirm}
        selectedCount={selectedImageIds.size}
        isOperating={isOperating}
      />

      {/* Move Dialog */}
      <MoveToModelDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        identities={identities}
        excludeIdentityIds={Array.from(sourceIdentityIds)}
        onSelect={handleMoveToModel}
        onCreateNew={() => setSplitDialogOpen(true)}
        selectedCount={selectedImageIds.size}
      />
    </DndContext>
  );
}
