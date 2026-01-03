import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type CurationStatus = "pending" | "included" | "excluded" | "failed";
export type Slot = "A" | "B" | "C" | "D";
export type Gender = "women" | "men";
export type ProductType = "tops" | "trousers";

export interface LibraryPose {
  id: string;
  library_id: string;
  clay_image_id: string;
  slot: Slot;
  gender: Gender | null;
  product_type: ProductType | null;
  curation_status: CurationStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  clay_image_url?: string;
}

export interface PoseFilters {
  slot: Slot | "all";
  gender: Gender | "all";
  status: CurationStatus | "all";
}

export interface CoverageStats {
  women: Record<Slot, { included: number; pending: number; excluded: number; failed: number }>;
  men: Record<Slot, { included: number; pending: number; excluded: number; failed: number }>;
}

const DEFAULT_COVERAGE: CoverageStats = {
  women: {
    A: { included: 0, pending: 0, excluded: 0, failed: 0 },
    B: { included: 0, pending: 0, excluded: 0, failed: 0 },
    C: { included: 0, pending: 0, excluded: 0, failed: 0 },
    D: { included: 0, pending: 0, excluded: 0, failed: 0 },
  },
  men: {
    A: { included: 0, pending: 0, excluded: 0, failed: 0 },
    B: { included: 0, pending: 0, excluded: 0, failed: 0 },
    C: { included: 0, pending: 0, excluded: 0, failed: 0 },
    D: { included: 0, pending: 0, excluded: 0, failed: 0 },
  },
};

export function useLibraryPoses(libraryId: string | null) {
  const [poses, setPoses] = useState<LibraryPose[]>([]);
  const [loading, setLoading] = useState(false);
  const [coverage, setCoverage] = useState<CoverageStats>(DEFAULT_COVERAGE);

  const fetchPoses = useCallback(async () => {
    if (!libraryId) {
      setPoses([]);
      setCoverage(DEFAULT_COVERAGE);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("library_poses")
        .select(`
          *,
          clay_images!inner(stored_url)
        `)
        .eq("library_id", libraryId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const typedPoses: LibraryPose[] = (data || []).map((p: any) => ({
        id: p.id,
        library_id: p.library_id,
        clay_image_id: p.clay_image_id,
        slot: p.slot as Slot,
        gender: p.gender as Gender | null,
        product_type: p.product_type as ProductType | null,
        curation_status: p.curation_status as CurationStatus,
        notes: p.notes,
        created_at: p.created_at,
        updated_at: p.updated_at,
        clay_image_url: p.clay_images?.stored_url,
      }));

      setPoses(typedPoses);
      calculateCoverage(typedPoses);
    } catch (err) {
      console.error("Error fetching poses:", err);
      toast.error("Failed to load poses");
    } finally {
      setLoading(false);
    }
  }, [libraryId]);

  const calculateCoverage = (poseList: LibraryPose[]) => {
    const stats: CoverageStats = JSON.parse(JSON.stringify(DEFAULT_COVERAGE));

    poseList.forEach((pose) => {
      if (!pose.gender) return;
      const genderKey = pose.gender as Gender;
      const slot = pose.slot as Slot;
      const status = pose.curation_status as CurationStatus;

      if (stats[genderKey] && stats[genderKey][slot]) {
        stats[genderKey][slot][status]++;
      }
    });

    setCoverage(stats);
  };

  useEffect(() => {
    fetchPoses();
  }, [fetchPoses]);

  // Realtime subscription
  useEffect(() => {
    if (!libraryId) return;

    const channel = supabase
      .channel(`library_poses_${libraryId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "library_poses",
          filter: `library_id=eq.${libraryId}`,
        },
        () => {
          fetchPoses();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [libraryId, fetchPoses]);

  const updatePoseStatus = useCallback(async (poseIds: string[], newStatus: CurationStatus) => {
    try {
      const { error } = await supabase
        .from("library_poses")
        .update({ curation_status: newStatus })
        .in("id", poseIds);

      if (error) throw error;

      // Optimistic update
      setPoses((prev) =>
        prev.map((p) =>
          poseIds.includes(p.id) ? { ...p, curation_status: newStatus } : p
        )
      );

      toast.success(`Updated ${poseIds.length} pose(s) to ${newStatus}`);
    } catch (err) {
      console.error("Error updating pose status:", err);
      toast.error("Failed to update poses");
      fetchPoses(); // Rollback
    }
  }, [fetchPoses]);

  const movePosesToSlot = useCallback(async (poseIds: string[], newSlot: Slot) => {
    try {
      const { error } = await supabase
        .from("library_poses")
        .update({ slot: newSlot })
        .in("id", poseIds);

      if (error) throw error;

      // Optimistic update
      setPoses((prev) =>
        prev.map((p) =>
          poseIds.includes(p.id) ? { ...p, slot: newSlot } : p
        )
      );

      toast.success(`Moved ${poseIds.length} pose(s) to Slot ${newSlot}`);
    } catch (err) {
      console.error("Error moving poses:", err);
      toast.error("Failed to move poses");
      fetchPoses();
    }
  }, [fetchPoses]);

  const deletePoses = useCallback(async (poseIds: string[]) => {
    try {
      const { error } = await supabase
        .from("library_poses")
        .delete()
        .in("id", poseIds);

      if (error) throw error;

      setPoses((prev) => prev.filter((p) => !poseIds.includes(p.id)));
      toast.success(`Deleted ${poseIds.length} pose(s)`);
    } catch (err) {
      console.error("Error deleting poses:", err);
      toast.error("Failed to delete poses");
      fetchPoses();
    }
  }, [fetchPoses]);

  const filterPoses = useCallback((filters: PoseFilters): LibraryPose[] => {
    return poses.filter((p) => {
      if (filters.slot !== "all" && p.slot !== filters.slot) return false;
      if (filters.gender !== "all" && p.gender !== filters.gender) return false;
      if (filters.status !== "all" && p.curation_status !== filters.status) return false;
      return true;
    });
  }, [poses]);

  return {
    poses,
    loading,
    coverage,
    updatePoseStatus,
    movePosesToSlot,
    deletePoses,
    filterPoses,
    refetch: fetchPoses,
  };
}
