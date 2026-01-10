import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AIApplyQueueItem, AIApplySettings, DEFAULT_AI_APPLY_SETTINGS } from '@/types/ai-apply';

interface UseAIApplyQueueOptions {
  projectId: string;
  onComplete?: () => void;
}

export function useAIApplyQueue({ projectId, onComplete }: UseAIApplyQueueOptions) {
  const [queue, setQueue] = useState<AIApplyQueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [settings, setSettings] = useState<AIApplySettings>({
    attemptsPerView: 4,
    strictness: 'high',
    model: 'google/gemini-2.5-flash-image-preview',
  });

  // Process queue items one at a time
  useEffect(() => {
    const processNext = async () => {
      const pendingItem = queue.find(item => item.status === 'queued');
      if (!pendingItem || isProcessing) return;

      setIsProcessing(true);
      updateItemStatus(pendingItem.id, 'processing');

      try {
        // Call the edge function
        const { data, error } = await supabase.functions.invoke('generate-ai-apply', {
          body: {
            projectId,
            lookId: pendingItem.lookId,
            view: pendingItem.view,
            type: pendingItem.type,
            attemptsPerView: pendingItem.attemptsRequested || settings.attemptsPerView,
            model: settings.model,
            strictness: settings.strictness,
          },
        });

        if (error) throw error;

        updateItemStatus(pendingItem.id, 'completed', data?.jobId);
      } catch (error: any) {
        console.error('AI Apply queue error:', error);
        updateItemStatus(pendingItem.id, 'failed', undefined, error.message);
      } finally {
        setIsProcessing(false);
        onComplete?.();
      }
    };

    processNext();
  }, [queue, isProcessing, projectId, settings, onComplete]);

  const updateItemStatus = useCallback((
    id: string, 
    status: AIApplyQueueItem['status'],
    jobId?: string,
    error?: string
  ) => {
    setQueue(prev => prev.map(item => 
      item.id === id 
        ? { ...item, status, jobId, error } 
        : item
    ));
  }, []);

  // Add item to queue
  const addToQueue = useCallback((
    type: AIApplyQueueItem['type'],
    lookId: string,
    lookName: string,
    view?: string,
    attemptsRequested?: number
  ): boolean => {
    // Check for duplicates (same look + view + type that's not completed/failed)
    const isDuplicate = queue.some(
      item => item.lookId === lookId && 
              item.view === view && 
              item.type === type &&
              (item.status === 'queued' || item.status === 'processing')
    );

    if (isDuplicate) return false;

    const newItem: AIApplyQueueItem = {
      id: crypto.randomUUID(),
      lookId,
      lookName,
      view,
      type,
      status: 'queued',
      attemptsRequested: attemptsRequested || settings.attemptsPerView,
    };

    setQueue(prev => [...prev, newItem]);
    return true;
  }, [queue, settings.attemptsPerView]);

  // Add multiple looks to queue at once
  const addBulkToQueue = useCallback((
    type: AIApplyQueueItem['type'],
    looks: Array<{ id: string; name: string }>,
    view?: string,
    attemptsRequested?: number
  ): number => {
    let addedCount = 0;
    
    for (const look of looks) {
      const added = addToQueue(type, look.id, look.name, view, attemptsRequested);
      if (added) addedCount++;
    }
    
    return addedCount;
  }, [addToQueue]);

  // Remove item from queue
  const removeFromQueue = useCallback((id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
  }, []);

  // Clear entire queue (except processing items)
  const clearQueue = useCallback(() => {
    setQueue(prev => prev.filter(item => item.status === 'processing'));
  }, []);

  // Clear completed/failed items
  const clearCompleted = useCallback(() => {
    setQueue(prev => prev.filter(
      item => item.status !== 'completed' && item.status !== 'failed'
    ));
  }, []);

  // Get counts
  const pendingCount = queue.filter(item => item.status === 'queued').length;
  const processingCount = queue.filter(item => item.status === 'processing').length;
  const completedCount = queue.filter(item => item.status === 'completed').length;
  const failedCount = queue.filter(item => item.status === 'failed').length;

  return {
    queue,
    isProcessing,
    settings,
    setSettings,
    addToQueue,
    addBulkToQueue,
    removeFromQueue,
    clearQueue,
    clearCompleted,
    pendingCount,
    processingCount,
    completedCount,
    failedCount,
  };
}
