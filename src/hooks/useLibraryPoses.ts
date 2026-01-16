import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  OutputShotType, 
  ALL_OUTPUT_SHOT_TYPES, 
  OUTPUT_SHOT_LABELS,
  slotToShotType,
  shotTypeToSlot,
} from "@/types/shot-types";

export type CurationStatus = "pending" | "included" | "excluded" | "failed";
export type Gender = "women" | "men";
export type ProductType = "tops" | "trousers";
export type CropTarget = "top" | "trousers";

// Re-export shot types for components that import from this hook
export type { OutputShotType };
export { ALL_OUTPUT_SHOT_TYPES, OUTPUT_SHOT_LABELS };

export interface LibraryPose {
  id: string;
  library_id: string;
  clay_image_id: string;
  shotType: OutputShotType; // Use new shot type
  slot: string; // Keep legacy slot for backward compatibility
  gender: Gender | null;
  product_type: ProductType | null;
  crop_target: CropTarget | null; // For FRONT_CROPPED: top = waist-up, trousers = waist-down
  curation_status: CurationStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  clay_image_url?: string;
}

export interface PoseFilters {
  shotType: OutputShotType | "all";
  gender: Gender | "all";
  status: CurationStatus | "all";
}

export interface CoverageStats {
  women: Record<OutputShotType, { included: number; pending: number; excluded: number; failed: number }>;
  men: Record<OutputShotType, { included: number; pending: number; excluded: number; failed: number }>;
}

const createEmptySlotStats = () => ({
  included: 0,
  pending: 0,
  excluded: 0,
  failed: 0,
});

const DEFAULT_COVERAGE: CoverageStats = {
  women: {
    FRONT_FULL: createEmptySlotStats(),
    FRONT_CROPPED: createEmptySlotStats(),
    DETAIL: createEmptySlotStats(),
    BACK_FULL: createEmptySlotStats(),
  },
  men: {
    FRONT_FULL: createEmptySlotStats(),
    FRONT_CROPPED: createEmptySlotStats(),
    DETAIL: createEmptySlotStats(),
    BACK_FULL: createEmptySlotStats(),
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
          clay_images!inner(
            stored_url,
            product_images!inner(crop_target)
          )
        `)
        .eq("library_id", libraryId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const typedPoses: LibraryPose[] = (data || []).map((p: any) => {
        // Use shot_type if available, otherwise convert from slot
        const shotType = p.shot_type || slotToShotType(p.slot) || 'FRONT_FULL';
        // Get crop_target from the nested product_images via clay_images
        const cropTarget = p.clay_images?.product_images?.crop_target as CropTarget | null;
        return {
          id: p.id,
          library_id: p.library_id,
          clay_image_id: p.clay_image_id,
          shotType: shotType as OutputShotType,
          slot: p.slot, // Keep legacy slot
          gender: p.gender as Gender | null,
          product_type: p.product_type as ProductType | null,
          crop_target: cropTarget,
          curation_status: p.curation_status as CurationStatus,
          notes: p.notes,
          created_at: p.created_at,
          updated_at: p.updated_at,
          clay_image_url: p.clay_images?.stored_url,
        };
      });

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
      const shotType = pose.shotType;
      const status = pose.curation_status as CurationStatus;

      if (stats[genderKey] && stats[genderKey][shotType]) {
        stats[genderKey][shotType][status]++;
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

  const movePosesToShotType = useCallback(async (poseIds: string[], newShotType: OutputShotType) => {
    try {
      const newSlot = shotTypeToSlot(newShotType);
      const { error } = await supabase
        .from("library_poses")
        .update({ slot: newSlot, shot_type: newShotType })
        .in("id", poseIds);

      if (error) throw error;

      // Optimistic update
      setPoses((prev) =>
        prev.map((p) =>
          poseIds.includes(p.id) ? { ...p, shotType: newShotType, slot: newSlot } : p
        )
      );

      toast.success(`Moved ${poseIds.length} pose(s) to ${OUTPUT_SHOT_LABELS[newShotType]}`);
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

  // Update crop_target on the source product_image via clay_image
  const setCropTarget = useCallback(async (poseIds: string[], cropTarget: CropTarget) => {
    try {
      // Get the clay_image_ids for the poses
      const posesToUpdate = poses.filter(p => poseIds.includes(p.id));
      const clayImageIds = posesToUpdate.map(p => p.clay_image_id);
      
      // Get product_image_ids from clay_images
      const { data: clayImages, error: fetchError } = await supabase
        .from("clay_images")
        .select("id, product_image_id")
        .in("id", clayImageIds);
      
      if (fetchError) throw fetchError;
      
      const productImageIds = clayImages?.map(ci => ci.product_image_id).filter(Boolean) || [];
      
      if (productImageIds.length === 0) {
        toast.error("No product images found for these poses");
        return;
      }
      
      // Update crop_target on product_images
      const { error: updateError } = await supabase
        .from("product_images")
        .update({ crop_target: cropTarget })
        .in("id", productImageIds);

      if (updateError) throw updateError;

      // Optimistic update
      setPoses((prev) =>
        prev.map((p) =>
          poseIds.includes(p.id) ? { ...p, crop_target: cropTarget } : p
        )
      );

      toast.success(`Set crop target to "${cropTarget}" for ${poseIds.length} pose(s)`);
    } catch (err) {
      console.error("Error setting crop target:", err);
      toast.error("Failed to set crop target");
      fetchPoses();
    }
  }, [poses, fetchPoses]);

  const filterPoses = useCallback((filters: PoseFilters): LibraryPose[] => {
    return poses.filter((p) => {
      if (filters.shotType !== "all" && p.shotType !== filters.shotType) return false;
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
    movePosesToShotType,
    deletePoses,
    setCropTarget,
    filterPoses,
    refetch: fetchPoses,
  };
}
