import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface QueueProgress {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  total: number;
  isActive: boolean;
  percentage: number;
}

export function useExpressionQueueProgress(jobId: string | null) {
  const [progress, setProgress] = useState<QueueProgress>({
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    total: 0,
    isActive: false,
    percentage: 0,
  });

  const fetchCounts = useCallback(async () => {
    if (!jobId) return;

    const { data, error } = await supabase
      .from("expression_render_queue")
      .select("status")
      .eq("job_id", jobId);

    if (error || !data) return;

    const counts = { pending: 0, processing: 0, completed: 0, failed: 0, cancelled: 0 };
    for (const row of data) {
      const s = row.status as keyof typeof counts;
      if (s in counts) counts[s]++;
    }

    const total = data.length;
    const done = counts.completed + counts.failed + counts.cancelled;
    const isActive = total > 0 && (counts.pending > 0 || counts.processing > 0);

    setProgress({
      ...counts,
      total,
      isActive,
      percentage: total > 0 ? Math.round((done / total) * 100) : 0,
    });
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;

    fetchCounts();

    // Poll every 3 seconds when active
    const interval = setInterval(fetchCounts, 3000);

    // Also subscribe to realtime changes
    const channel = supabase
      .channel(`expr-queue-${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "expression_render_queue",
          filter: `job_id=eq.${jobId}`,
        },
        () => fetchCounts()
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [jobId, fetchCounts]);

  const cancelPending = useCallback(async () => {
    if (!jobId) return;

    await supabase
      .from("expression_render_queue")
      .update({ status: "cancelled", completed_at: new Date().toISOString() })
      .eq("job_id", jobId)
      .eq("status", "pending");

    await supabase
      .from("jobs")
      .update({ status: "stopped", updated_at: new Date().toISOString() })
      .eq("id", jobId);

    fetchCounts();
  }, [jobId, fetchCounts]);

  return { progress, cancelPending, refetch: fetchCounts };
}
