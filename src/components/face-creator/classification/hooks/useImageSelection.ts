import { useState, useCallback } from 'react';
import { IdentityImage } from '../types';

interface UseImageSelectionReturn {
  selectedImageIds: Set<string>;
  lastSelectedId: string | null;
  selectImage: (imageId: string, event: React.MouseEvent) => void;
  selectRange: (imageIds: string[]) => void;
  selectAll: (imageIds: string[]) => void;
  clearSelection: () => void;
  toggleSelection: (imageId: string) => void;
  isSelected: (imageId: string) => boolean;
  getSelectedFromIdentity: (identityId: string, imagesByIdentity: Record<string, IdentityImage[]>) => string[];
}

export function useImageSelection(): UseImageSelectionReturn {
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [lastSelectedList, setLastSelectedList] = useState<string[]>([]);

  const selectImage = useCallback((imageId: string, event: React.MouseEvent) => {
    const isShift = event.shiftKey;
    const isCmd = event.metaKey || event.ctrlKey;

    if (isShift && lastSelectedId && lastSelectedList.length > 0) {
      // Range select
      const lastIndex = lastSelectedList.indexOf(lastSelectedId);
      const currentIndex = lastSelectedList.indexOf(imageId);
      
      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        const rangeIds = lastSelectedList.slice(start, end + 1);
        
        setSelectedImageIds(prev => {
          const newSet = new Set(prev);
          rangeIds.forEach(id => newSet.add(id));
          return newSet;
        });
      }
    } else if (isCmd) {
      // Toggle individual selection
      setSelectedImageIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(imageId)) {
          newSet.delete(imageId);
        } else {
          newSet.add(imageId);
        }
        return newSet;
      });
      setLastSelectedId(imageId);
    } else {
      // Single select (clear others)
      setSelectedImageIds(new Set([imageId]));
      setLastSelectedId(imageId);
    }
  }, [lastSelectedId, lastSelectedList]);

  const selectRange = useCallback((imageIds: string[]) => {
    setSelectedImageIds(prev => {
      const newSet = new Set(prev);
      imageIds.forEach(id => newSet.add(id));
      return newSet;
    });
    setLastSelectedList(imageIds);
  }, []);

  const selectAll = useCallback((imageIds: string[]) => {
    setSelectedImageIds(new Set(imageIds));
    setLastSelectedList(imageIds);
    if (imageIds.length > 0) {
      setLastSelectedId(imageIds[imageIds.length - 1]);
    }
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedImageIds(new Set());
    setLastSelectedId(null);
  }, []);

  const toggleSelection = useCallback((imageId: string) => {
    setSelectedImageIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(imageId)) {
        newSet.delete(imageId);
      } else {
        newSet.add(imageId);
      }
      return newSet;
    });
  }, []);

  const isSelected = useCallback((imageId: string) => {
    return selectedImageIds.has(imageId);
  }, [selectedImageIds]);

  const getSelectedFromIdentity = useCallback((
    identityId: string,
    imagesByIdentity: Record<string, IdentityImage[]>
  ): string[] => {
    const images = imagesByIdentity[identityId] || [];
    return images.filter(img => selectedImageIds.has(img.id)).map(img => img.id);
  }, [selectedImageIds]);

  return {
    selectedImageIds,
    lastSelectedId,
    selectImage,
    selectRange,
    selectAll,
    clearSelection,
    toggleSelection,
    isSelected,
    getSelectedFromIdentity,
  };
}
