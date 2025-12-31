import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Brand {
  id: string;
  name: string;
  start_url: string;
  created_at: string;
}

export function useBrands() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBrands = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("brands")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      setBrands(data || []);
    } catch (err) {
      console.error("Error fetching brands:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBrands();
  }, [fetchBrands]);

  const createBrand = async (name: string, startUrl?: string) => {
    try {
      const { data, error } = await supabase
        .from("brands")
        .insert({
          name,
          start_url: startUrl || "",
        })
        .select()
        .single();

      if (error) throw error;
      
      toast.success("Brand created");
      await fetchBrands();
      return data;
    } catch (err) {
      console.error("Error creating brand:", err);
      toast.error("Failed to create brand");
      return null;
    }
  };

  const deleteBrand = async (id: string) => {
    try {
      const { error } = await supabase
        .from("brands")
        .delete()
        .eq("id", id);

      if (error) throw error;
      
      toast.success("Brand deleted");
      await fetchBrands();
      return true;
    } catch (err) {
      console.error("Error deleting brand:", err);
      toast.error("Failed to delete brand");
      return false;
    }
  };

  const updateBrand = async (id: string, updates: Partial<Pick<Brand, "name" | "start_url">>) => {
    try {
      const { error } = await supabase
        .from("brands")
        .update(updates)
        .eq("id", id);

      if (error) throw error;
      
      toast.success("Brand updated");
      await fetchBrands();
      return true;
    } catch (err) {
      console.error("Error updating brand:", err);
      toast.error("Failed to update brand");
      return false;
    }
  };

  return {
    brands,
    loading,
    fetchBrands,
    createBrand,
    deleteBrand,
    updateBrand,
  };
}
