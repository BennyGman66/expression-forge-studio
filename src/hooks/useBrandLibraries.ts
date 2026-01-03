import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type LibraryStatus = "draft" | "review" | "locked";

export interface BrandPoseLibrary {
  id: string;
  brand_id: string;
  version: number;
  status: LibraryStatus;
  config_json: {
    min_poses_per_slot?: number;
  };
  locked_at: string | null;
  locked_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useBrandLibraries(brandId: string | null) {
  const [libraries, setLibraries] = useState<BrandPoseLibrary[]>([]);
  const [activeLibrary, setActiveLibrary] = useState<BrandPoseLibrary | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchLibraries = useCallback(async () => {
    if (!brandId) {
      setLibraries([]);
      setActiveLibrary(null);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("brand_pose_libraries")
        .select("*")
        .eq("brand_id", brandId)
        .order("version", { ascending: false });

      if (error) throw error;

      const typedData = (data || []) as BrandPoseLibrary[];
      setLibraries(typedData);

      // Auto-select: prefer draft, then most recent
      const draft = typedData.find((l) => l.status === "draft");
      const selected = draft || typedData[0] || null;
      setActiveLibrary(selected);
    } catch (err) {
      console.error("Error fetching libraries:", err);
      toast.error("Failed to load libraries");
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => {
    fetchLibraries();
  }, [fetchLibraries]);

  const createLibrary = useCallback(async (brandIdToCreate: string): Promise<BrandPoseLibrary | null> => {
    try {
      // Get next version number
      const { data: existing } = await supabase
        .from("brand_pose_libraries")
        .select("version")
        .eq("brand_id", brandIdToCreate)
        .order("version", { ascending: false })
        .limit(1);

      const nextVersion = existing && existing.length > 0 ? existing[0].version + 1 : 1;

      const { data, error } = await supabase
        .from("brand_pose_libraries")
        .insert({
          brand_id: brandIdToCreate,
          version: nextVersion,
          status: "draft",
        })
        .select()
        .single();

      if (error) throw error;

      const newLibrary = data as BrandPoseLibrary;
      
      // Initialize with existing clay poses
      const { data: countData } = await supabase.rpc("initialize_library_from_clay_poses", {
        p_library_id: newLibrary.id,
        p_brand_id: brandIdToCreate,
      });

      toast.success(`Created library v${nextVersion} with ${countData || 0} poses`);
      await fetchLibraries();
      return newLibrary;
    } catch (err) {
      console.error("Error creating library:", err);
      toast.error("Failed to create library");
      return null;
    }
  }, [fetchLibraries]);

  const updateLibraryStatus = useCallback(async (libraryId: string, newStatus: LibraryStatus) => {
    try {
      const updates: Partial<BrandPoseLibrary> = { status: newStatus };
      if (newStatus === "locked") {
        updates.locked_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("brand_pose_libraries")
        .update(updates)
        .eq("id", libraryId);

      if (error) throw error;

      toast.success(`Library status updated to ${newStatus}`);
      await fetchLibraries();
    } catch (err) {
      console.error("Error updating library status:", err);
      toast.error("Failed to update library status");
    }
  }, [fetchLibraries]);

  const selectLibrary = useCallback((library: BrandPoseLibrary) => {
    setActiveLibrary(library);
  }, []);

  return {
    libraries,
    activeLibrary,
    loading,
    createLibrary,
    updateLibraryStatus,
    selectLibrary,
    refetch: fetchLibraries,
  };
}
