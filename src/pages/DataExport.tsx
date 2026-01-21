import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Loader2, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { HubHeader } from "@/components/layout/HubHeader";

// Tommy Hilfiger library ID
const TOMMY_HILFIGER_LIBRARY_ID = "41e2a47b-ac37-4dbf-beeb-e056d41028a2";

interface ExportStatus {
  clayPoses: "idle" | "loading" | "done";
  talents: "idle" | "loading" | "done";
  foundations: "idle" | "loading" | "done";
}

export default function DataExport() {
  const [status, setStatus] = useState<ExportStatus>({
    clayPoses: "idle",
    talents: "idle",
    foundations: "idle",
  });

  const downloadJson = (data: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportClayPoses = async () => {
    setStatus((s) => ({ ...s, clayPoses: "loading" }));
    try {
      // Fetch library poses with clay image URLs
      const { data: poses, error } = await supabase
        .from("library_poses")
        .select(`
          id,
          slot,
          gender,
          product_type,
          shot_type,
          notes,
          curation_status,
          clay_images!inner(
            id,
            stored_url,
            product_images!inner(
              id,
              source_url,
              products!inner(
                sku,
                gender
              )
            )
          )
        `)
        .eq("library_id", TOMMY_HILFIGER_LIBRARY_ID)
        .eq("curation_status", "approved");

      if (error) throw error;

      const exportData = poses?.map((pose) => ({
        id: pose.id,
        clay_image_url: pose.clay_images?.stored_url,
        shot_type: pose.shot_type,
        slot: pose.slot,
        gender: pose.gender,
        product_type: pose.product_type,
        notes: pose.notes,
        sku: pose.clay_images?.product_images?.products?.sku,
      }));

      downloadJson(exportData, "clay-poses-export.json");
      toast.success(`Exported ${exportData?.length || 0} clay poses`);
      setStatus((s) => ({ ...s, clayPoses: "done" }));
    } catch (error) {
      console.error("Error exporting clay poses:", error);
      toast.error("Failed to export clay poses");
      setStatus((s) => ({ ...s, clayPoses: "idle" }));
    }
  };

  const exportDigitalTalents = async () => {
    setStatus((s) => ({ ...s, talents: "loading" }));
    try {
      // Fetch digital talents with their assets
      const { data: talents, error } = await supabase
        .from("digital_talents")
        .select(`
          id,
          name,
          gender,
          front_face_url,
          created_at,
          digital_talent_assets(
            asset_type,
            stored_url,
            metadata
          )
        `)
        .order("name");

      if (error) throw error;

      const exportData = talents?.map((talent) => {
        const assets = talent.digital_talent_assets || [];
        const frontFace = assets.find((a) => a.asset_type === "front_face");
        const sideFace = assets.find((a) => a.asset_type === "side_face");
        const backFace = assets.find((a) => a.asset_type === "back_face");
        const expressionMap = assets.find((a) => a.asset_type === "expression_map");

        return {
          id: talent.id,
          name: talent.name,
          gender: talent.gender,
          front_face_url: talent.front_face_url || frontFace?.stored_url,
          side_face_url: sideFace?.stored_url || null,
          back_face_url: backFace?.stored_url || null,
          expression_map_url: expressionMap?.stored_url || null,
          created_at: talent.created_at,
        };
      });

      downloadJson(exportData, "digital-talents-export.json");
      toast.success(`Exported ${exportData?.length || 0} digital talents`);
      setStatus((s) => ({ ...s, talents: "done" }));
    } catch (error) {
      console.error("Error exporting digital talents:", error);
      toast.error("Failed to export digital talents");
      setStatus((s) => ({ ...s, talents: "idle" }));
    }
  };

  const exportFaceFoundations = async () => {
    setStatus((s) => ({ ...s, foundations: "loading" }));
    try {
      // Fetch face identities with representative images
      const { data: identities, error } = await supabase
        .from("face_identities")
        .select(`
          id,
          name,
          gender,
          image_count,
          scrape_run_id,
          digital_talent_id,
          linked_twin_id,
          representative_image_id,
          face_scrape_images!face_identities_representative_image_id_fkey(
            stored_url,
            source_url,
            face_crops(
              cropped_stored_url
            )
          ),
          face_scrape_runs!face_identities_scrape_run_id_fkey(
            brand_name
          )
        `)
        .is("archived_at", null)
        .order("name");

      if (error) throw error;

      const exportData = identities?.map((identity) => {
        const repImage = identity.face_scrape_images;
        const croppedUrl = repImage?.face_crops?.[0]?.cropped_stored_url;

        return {
          id: identity.id,
          name: identity.name,
          gender: identity.gender,
          image_count: identity.image_count,
          representative_image_url: croppedUrl || repImage?.stored_url || null,
          source_brand: identity.face_scrape_runs?.brand_name || null,
          linked_talent_id: identity.digital_talent_id,
          linked_twin_id: identity.linked_twin_id,
        };
      });

      downloadJson(exportData, "face-foundations-export.json");
      toast.success(`Exported ${exportData?.length || 0} face foundations`);
      setStatus((s) => ({ ...s, foundations: "done" }));
    } catch (error) {
      console.error("Error exporting face foundations:", error);
      toast.error("Failed to export face foundations");
      setStatus((s) => ({ ...s, foundations: "idle" }));
    }
  };

  const getButtonContent = (statusKey: keyof ExportStatus, label: string) => {
    const s = status[statusKey];
    if (s === "loading") return <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Exporting...</>;
    if (s === "done") return <><CheckCircle className="h-4 w-4 mr-2 text-green-500" /> Downloaded</>;
    return <><Download className="h-4 w-4 mr-2" /> {label}</>;
  };

  return (
    <div className="min-h-screen bg-background">
      <HubHeader />
      <div className="container max-w-3xl py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Data Export</h1>
          <p className="text-muted-foreground mt-2">
            Export data for migration to the new workflow version.
          </p>
        </div>

        <div className="space-y-4">
          {/* Clay Poses Export */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Clay Poses (Tommy Hilfiger)</CardTitle>
              <CardDescription>
                Approved clay poses with shot types, slots, and gender info.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={exportClayPoses}
                disabled={status.clayPoses === "loading"}
                variant={status.clayPoses === "done" ? "outline" : "default"}
              >
                {getButtonContent("clayPoses", "Download clay-poses-export.json")}
              </Button>
            </CardContent>
          </Card>

          {/* Digital Talents Export */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Digital Talents</CardTitle>
              <CardDescription>
                All digital talents with front, side, and back face URLs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={exportDigitalTalents}
                disabled={status.talents === "loading"}
                variant={status.talents === "done" ? "outline" : "default"}
              >
                {getButtonContent("talents", "Download digital-talents-export.json")}
              </Button>
            </CardContent>
          </Card>

          {/* Face Foundations Export */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Face Foundations</CardTitle>
              <CardDescription>
                Face identities with representative images and source brand info.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={exportFaceFoundations}
                disabled={status.foundations === "loading"}
                variant={status.foundations === "done" ? "outline" : "default"}
              >
                {getButtonContent("foundations", "Download face-foundations-export.json")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
