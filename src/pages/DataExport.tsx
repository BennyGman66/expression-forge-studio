import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Loader2, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { HubHeader } from "@/components/layout/HubHeader";
import { OUTPUT_SHOT_LABELS, OutputShotType, SLOT_TO_SHOT_TYPE, LegacySlot } from "@/types/shot-types";

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
      // Fetch library poses
      const { data: poses, error: posesError } = await supabase
        .from("library_poses")
        .select("id, slot, gender, product_type, shot_type, notes, curation_status, clay_image_id")
        .eq("library_id", TOMMY_HILFIGER_LIBRARY_ID);

      if (posesError) throw posesError;

      // Get clay image IDs
      const clayImageIds = [...new Set(poses?.map(p => p.clay_image_id).filter(Boolean))];

      // Fetch clay images
      const { data: clayImages, error: clayError } = await supabase
        .from("clay_images")
        .select("id, stored_url")
        .in("id", clayImageIds);

      if (clayError) throw clayError;

      // Build lookup map
      const clayImageMap = new Map(clayImages?.map(ci => [ci.id, ci.stored_url]));

      const exportData = poses?.map((pose) => {
        // Derive shot_type from slot if not set directly
        const derivedShotType = pose.shot_type 
          ? (pose.shot_type as OutputShotType)
          : pose.slot && SLOT_TO_SHOT_TYPE[pose.slot as LegacySlot]
            ? SLOT_TO_SHOT_TYPE[pose.slot as LegacySlot]
            : null;

        return {
          id: pose.id,
          clay_image_url: clayImageMap.get(pose.clay_image_id) || null,
          shot_type: derivedShotType,
          shot_type_label: derivedShotType 
            ? OUTPUT_SHOT_LABELS[derivedShotType] 
            : null,
          slot: pose.slot,
          gender: pose.gender,
          product_type: pose.product_type,
          notes: pose.notes,
          curation_status: pose.curation_status,
        };
      });

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
      // First fetch all face foundation outputs
      const { data: outputs, error: outputsError } = await supabase
        .from("face_pairing_outputs")
        .select("id, stored_url, status, created_at, pairing_id")
        .eq("is_face_foundation", true)
        .eq("status", "completed")
        .not("stored_url", "is", null)
        .order("created_at", { ascending: false });

      if (outputsError) throw outputsError;

      // Get unique pairing IDs to fetch talent info
      const pairingIds = [...new Set(outputs?.map(o => o.pairing_id).filter(Boolean))];
      
      // Fetch pairings with talent info
      const { data: pairings, error: pairingsError } = await supabase
        .from("face_pairings")
        .select("id, digital_talent_id")
        .in("id", pairingIds);

      if (pairingsError) throw pairingsError;

      // Get unique talent IDs
      const talentIds = [...new Set(pairings?.map(p => p.digital_talent_id).filter(Boolean))];

      // Fetch talent details
      const { data: talents, error: talentsError } = await supabase
        .from("digital_talents")
        .select("id, name, gender")
        .in("id", talentIds);

      if (talentsError) throw talentsError;

      // Build lookup maps
      const pairingToTalent = new Map(pairings?.map(p => [p.id, p.digital_talent_id]));
      const talentInfo = new Map(talents?.map(t => [t.id, { name: t.name, gender: t.gender }]));

      const exportData = outputs?.map((output) => {
        const talentId = pairingToTalent.get(output.pairing_id);
        const talent = talentId ? talentInfo.get(talentId) : null;
        
        return {
          id: output.id,
          stored_url: output.stored_url,
          talent_id: talentId || null,
          talent_name: talent?.name || null,
          talent_gender: talent?.gender || null,
          created_at: output.created_at,
        };
      });

      downloadJson(exportData, "face-foundations-export.json");
      toast.success(`Exported ${exportData?.length || 0} face foundation images`);
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
                All clay poses with shot types, slots, and gender info.
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
                Rendered face foundation images for all digital talents.
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
