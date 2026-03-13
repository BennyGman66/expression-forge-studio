import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const MAX_CONCURRENT = 3;
const DISPATCH_DELAY_MS = 500;
const RETRY_DELAYS = [2000, 4000, 8000]; // exponential backoff

interface WorkerState {
  active: number;
  stopped: boolean;
}

/**
 * Client-side concurrent workers that call process-expression-queue
 * in parallel to supplement server-side cron triggers.
 * Runs while the tab is open; cron continues if tab closes.
 */
export function useExpressionQueueWorkers(jobId: string | null) {
  const stateRef = useRef<WorkerState>({ active: 0, stopped: true });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const invokeWorker = useCallback(async (retryIndex = 0): Promise<void> => {
    if (stateRef.current.stopped) return;

    stateRef.current.active++;
    try {
      const resp = await supabase.functions.invoke("process-expression-queue", {
        body: { source: "client-worker" },
      });

      // Check if there's nothing left to process
      if (resp.data?.message === "No items to process") {
        // Queue is empty, stop workers
        stateRef.current.stopped = true;
        return;
      }

      if (resp.data?.rateLimited) {
        // Back off on rate limit
        const delay = RETRY_DELAYS[Math.min(retryIndex, RETRY_DELAYS.length - 1)];
        await new Promise((r) => setTimeout(r, delay));
        return;
      }

      if (resp.data?.creditsExhausted) {
        stateRef.current.stopped = true;
        return;
      }
    } catch (err) {
      // Network error — back off
      const delay = RETRY_DELAYS[Math.min(retryIndex, RETRY_DELAYS.length - 1)];
      await new Promise((r) => setTimeout(r, delay));
    } finally {
      stateRef.current.active--;
    }
  }, []);

  const dispatchLoop = useCallback(async () => {
    if (stateRef.current.stopped) return;

    // Fill up to MAX_CONCURRENT slots
    while (stateRef.current.active < MAX_CONCURRENT && !stateRef.current.stopped) {
      invokeWorker();
      await new Promise((r) => setTimeout(r, DISPATCH_DELAY_MS));
    }
  }, [invokeWorker]);

  useEffect(() => {
    if (!jobId) {
      stateRef.current.stopped = true;
      return;
    }

    // Start workers
    stateRef.current.stopped = false;
    stateRef.current.active = 0;

    // Initial dispatch
    dispatchLoop();

    // Re-dispatch every 5 seconds to fill empty slots
    intervalRef.current = setInterval(dispatchLoop, 5000);

    return () => {
      stateRef.current.stopped = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [jobId, dispatchLoop]);

  const stop = useCallback(() => {
    stateRef.current.stopped = true;
  }, []);

  return { stop };
}
