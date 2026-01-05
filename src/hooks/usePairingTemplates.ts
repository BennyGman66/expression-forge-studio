import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PairingTemplate, PairingTemplateWithRelations } from "@/types/pairing-templates";
import { toast } from "sonner";

export function usePairingTemplates(digitalTalentId?: string) {
  const [templates, setTemplates] = useState<PairingTemplateWithRelations[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("talent_pairing_templates")
        .select(`
          *,
          digital_talent:digital_talents!talent_pairing_templates_digital_talent_id_fkey (
            id, name, front_face_url, gender
          ),
          digital_twin:digital_twins!talent_pairing_templates_digital_twin_id_fkey (
            id, name, representative_image_url, gender
          ),
          face_identity:face_identities!talent_pairing_templates_face_identity_id_fkey (
            id, name, gender, image_count
          )
        `)
        .order("last_used_at", { ascending: false, nullsFirst: false });

      if (digitalTalentId) {
        query = query.eq("digital_talent_id", digitalTalentId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setTemplates((data || []) as PairingTemplateWithRelations[]);
    } catch (error) {
      console.error("Error fetching pairing templates:", error);
    } finally {
      setLoading(false);
    }
  }, [digitalTalentId]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const createTemplate = async (params: {
    name: string;
    digitalTalentId: string;
    digitalTwinId?: string | null;
    faceIdentityId?: string | null;
    scrapeRunId?: string | null;
  }) => {
    try {
      const { data, error } = await supabase
        .from("talent_pairing_templates")
        .insert({
          name: params.name,
          digital_talent_id: params.digitalTalentId,
          digital_twin_id: params.digitalTwinId || null,
          face_identity_id: params.faceIdentityId || null,
          scrape_run_id: params.scrapeRunId || null,
        })
        .select()
        .single();

      if (error) throw error;
      
      toast.success("Pairing saved");
      await fetchTemplates();
      return data as PairingTemplate;
    } catch (error) {
      console.error("Error creating pairing template:", error);
      toast.error("Failed to save pairing");
      return null;
    }
  };

  const deleteTemplate = async (templateId: string) => {
    try {
      const { error } = await supabase
        .from("talent_pairing_templates")
        .delete()
        .eq("id", templateId);

      if (error) throw error;
      
      toast.success("Pairing deleted");
      await fetchTemplates();
      return true;
    } catch (error) {
      console.error("Error deleting pairing template:", error);
      toast.error("Failed to delete pairing");
      return false;
    }
  };

  const recordUsage = async (templateId: string) => {
    try {
      const template = templates.find(t => t.id === templateId);
      if (!template) return;

      await supabase
        .from("talent_pairing_templates")
        .update({
          last_used_at: new Date().toISOString(),
          usage_count: template.usage_count + 1,
        })
        .eq("id", templateId);
    } catch (error) {
      console.error("Error recording template usage:", error);
    }
  };

  return {
    templates,
    loading,
    refetch: fetchTemplates,
    createTemplate,
    deleteTemplate,
    recordUsage,
  };
}
