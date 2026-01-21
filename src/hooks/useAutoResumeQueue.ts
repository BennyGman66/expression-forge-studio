import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AutoResumeStats {
  isAutoResuming: boolean;
  isEnabled: boolean;
  lastCheckTime: Date | null;
  nextRetryTime: Date | null;
  readyCount: number;
  pendingWithBackoff: number;
}

interface UseAutoResumeQueueOptions {
  batchId: string | undefined;
  enabled?: boolean;
  pollIntervalMs?: number;
  onResume?: () => void;
}

export function useAutoResumeQueue({
  batchId,
  enabled = true,
  pollIntervalMs = 30000,
  onResume,
}: UseAutoResumeQueueOptions): AutoResumeStats & {
  setEnabled: (enabled: boolean) => void;
  resumeNow: () => Promise<void>;
  resumeAllFailed: () => Promise<void>;
} {
  const [isAutoResuming, setIsAutoResuming] = useState(false);
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [lastCheckTime, setLastCheckTime] = useState<Date | null>(null);
  const [nextRetryTime, setNextRetryTime] = useState<Date | null>(null);
  const [readyCount, setReadyCount] = useState(0);
  const [pendingWithBackoff, setPendingWithBackoff] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const checkAndResume = useCallback(async () => {
    if (!batchId || !isEnabled) return;

    try {
      setLastCheckTime(new Date());
      const now = new Date().toISOString();

      // Count ready-to-process items (queued with no retry_after or past retry_after)
      const { data: readyItems, error: readyError } = await supabase
        .from("repose_outputs")
        .select("id")
        .eq("batch_id", batchId)
        .eq("status", "queued")
        .or(`retry_after.is.null,retry_after.lt.${now}`);

      if (readyError) {
        console.error("[AutoResume] Error fetching ready items:", readyError);
        return;
      }

      // Count items waiting for backoff
      const { data: backoffItems, error: backoffError } = await supabase
        .from("repose_outputs")
        .select("id, retry_after")
        .eq("batch_id", batchId)
        .eq("status", "queued")
        .gt("retry_after", now)
        .order("retry_after", { ascending: true });

      if (backoffError) {
        console.error("[AutoResume] Error fetching backoff items:", backoffError);
      }

      setReadyCount(readyItems?.length || 0);
      setPendingWithBackoff(backoffItems?.length || 0);

      // Update next retry time
      if (backoffItems?.length) {
        setNextRetryTime(new Date(backoffItems[0].retry_after));
      } else {
        setNextRetryTime(null);
      }

      // Check if queue is currently processing
      const { data: runningItems } = await supabase
        .from("repose_outputs")
        .select("id")
        .eq("batch_id", batchId)
        .eq("status", "running")
        .limit(1);

      // If there are ready items but nothing running, auto-resume
      if (readyItems?.length && !runningItems?.length) {
        console.log(`[AutoResume] Detected ${readyItems.length} stalled items, resuming...`);
        setIsAutoResuming(true);
        
        try {
          const { error } = await supabase.functions.invoke("process-repose-queue", {
            body: { batchId, imageSize: "4K" },
          });
          
          if (error) {
            console.error("[AutoResume] Resume failed:", error);
            toast.error("Auto-resume failed: " + error.message);
          } else {
            toast.success(`Auto-resumed ${readyItems.length} pending outputs`);
            onResume?.();
          }
        } finally {
          setIsAutoResuming(false);
        }
      }
    } catch (error) {
      console.error("[AutoResume] Check error:", error);
    }
  }, [batchId, isEnabled, onResume]);

  // Manual resume now
  const resumeNow = useCallback(async () => {
    if (!batchId) return;
    
    setIsAutoResuming(true);
    try {
      const { error } = await supabase.functions.invoke("process-repose-queue", {
        body: { batchId, imageSize: "4K" },
      });
      
      if (error) {
        console.error("[AutoResume] Manual resume failed:", error);
        toast.error("Resume failed: " + error.message);
      } else {
        toast.success("Queue processing resumed");
        onResume?.();
      }
    } finally {
      setIsAutoResuming(false);
    }
  }, [batchId, onResume]);

  // Resume all failed items
  const resumeAllFailed = useCallback(async () => {
    if (!batchId) return;
    
    setIsAutoResuming(true);
    try {
      // Reset all failed items to queued with cleared retry tracking
      const { error: updateError, count } = await supabase
        .from("repose_outputs")
        .update({ 
          status: "queued", 
          retry_count: 0, 
          retry_after: null,
          error_message: null,
        })
        .eq("batch_id", batchId)
        .eq("status", "failed");

      if (updateError) {
        toast.error("Failed to reset items: " + updateError.message);
        return;
      }

      toast.success(`Reset ${count || 0} failed items`);

      // Start processing
      const { error } = await supabase.functions.invoke("process-repose-queue", {
        body: { batchId, imageSize: "4K" },
      });
      
      if (error) {
        console.error("[AutoResume] Resume all failed error:", error);
        toast.error("Resume failed: " + error.message);
      } else {
        toast.success("Queue processing started");
        onResume?.();
      }
    } finally {
      setIsAutoResuming(false);
    }
  }, [batchId, onResume]);

  // Set up polling interval
  useEffect(() => {
    if (!batchId || !isEnabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Check immediately
    checkAndResume();

    // Then poll at interval
    intervalRef.current = setInterval(checkAndResume, pollIntervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [batchId, isEnabled, pollIntervalMs, checkAndResume]);

  return {
    isAutoResuming,
    isEnabled,
    lastCheckTime,
    nextRetryTime,
    readyCount,
    pendingWithBackoff,
    setEnabled: setIsEnabled,
    resumeNow,
    resumeAllFailed,
  };
}
