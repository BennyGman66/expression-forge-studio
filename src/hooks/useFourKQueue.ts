import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface FourKQueueItem {
  id: string;
  outputId: string;
  sku: string;
  shotType: string;
  rank: number;
  resolution: "2K" | "4K";
  status: "queued" | "processing" | "completed" | "failed";
  error?: string;
}

interface UseFourKQueueOptions {
  onComplete?: () => void;
}

export function useFourKQueue({ onComplete }: UseFourKQueueOptions = {}) {
  const [queue, setQueue] = useState<FourKQueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const stopRef = useRef(false);

  // Process queue items sequentially
  useEffect(() => {
    const processNext = async () => {
      if (stopRef.current) {
        setIsProcessing(false);
        return;
      }

      const nextItem = queue.find((item) => item.status === "queued");
      if (!nextItem) {
        if (queue.some((item) => item.status === "processing")) return;
        setIsProcessing(false);
        if (queue.length > 0 && queue.every((item) => 
          item.status === "completed" || item.status === "failed"
        )) {
          onComplete?.();
        }
        return;
      }

      // Update to processing
      setQueue((prev) =>
        prev.map((item) =>
          item.id === nextItem.id ? { ...item, status: "processing" as const } : item
        )
      );

      try {
        // Call the edge function
        const { error } = await supabase.functions.invoke("generate-repose-single", {
          body: {
            outputId: nextItem.outputId,
            imageSize: nextItem.resolution,
          },
        });

        if (error) throw error;

        // Mark as completed
        setQueue((prev) =>
          prev.map((item) =>
            item.id === nextItem.id ? { ...item, status: "completed" as const } : item
          )
        );
      } catch (err) {
        console.error("4K queue error:", err);
        setQueue((prev) =>
          prev.map((item) =>
            item.id === nextItem.id
              ? {
                  ...item,
                  status: "failed" as const,
                  error: err instanceof Error ? err.message : "Unknown error",
                }
              : item
          )
        );
      }
    };

    if (isProcessing) {
      processNext();
    }
  }, [queue, isProcessing, onComplete]);

  const addToQueue = useCallback(
    (items: Omit<FourKQueueItem, "id" | "status">[]) => {
      const newItems: FourKQueueItem[] = items.map((item) => ({
        ...item,
        id: `${item.outputId}-${Date.now()}-${Math.random()}`,
        status: "queued" as const,
      }));

      setQueue((prev) => [...prev, ...newItems]);
      setIsProcessing(true);
      stopRef.current = false;
    },
    []
  );

  const removeFromQueue = useCallback((id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearQueue = useCallback(() => {
    setQueue((prev) => prev.filter((item) => item.status === "processing"));
    stopRef.current = true;
  }, []);

  const clearCompleted = useCallback(() => {
    setQueue((prev) =>
      prev.filter((item) => item.status !== "completed" && item.status !== "failed")
    );
  }, []);

  const retryFailed = useCallback(() => {
    setQueue((prev) =>
      prev.map((item) =>
        item.status === "failed" ? { ...item, status: "queued" as const, error: undefined } : item
      )
    );
    setIsProcessing(true);
    stopRef.current = false;
  }, []);

  const pendingCount = queue.filter((item) => item.status === "queued").length;
  const processingCount = queue.filter((item) => item.status === "processing").length;
  const completedCount = queue.filter((item) => item.status === "completed").length;
  const failedCount = queue.filter((item) => item.status === "failed").length;

  return {
    queue,
    isProcessing,
    addToQueue,
    removeFromQueue,
    clearQueue,
    clearCompleted,
    retryFailed,
    pendingCount,
    processingCount,
    completedCount,
    failedCount,
  };
}
