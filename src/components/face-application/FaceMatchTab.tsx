import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LookSourceImage, FaceFoundation } from "@/types/face-application";

interface LookWithImages {
  id: string;
  name: string;
  digital_talent_id: string | null;
  sourceImages: LookSourceImage[];
}

interface TalentInfo {
  name: string;
  front_face_url: string | null;
}

interface FaceMatchTabProps {
  projectId: string;
  talentId: string | null;
  onContinue: () => void;
}

export function FaceMatchTab({ projectId, talentId, onContinue }: FaceMatchTabProps) {
  const [looks, setLooks] = useState<LookWithImages[]>([]);
  const [faceFoundations, setFaceFoundations] = useState<FaceFoundation[]>([]);
  const [matches, setMatches] = useState<Record<string, string>>({}); // sourceImageId -> faceUrl
  const [talentInfo, setTalentInfo] = useState<TalentInfo | null>(null);
  const [talentIds, setTalentIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  // Fetch ALL looks for this PROJECT with their source images
  useEffect(() => {
    if (!projectId) return;
    const fetchLooks = async () => {
      // Get all looks for this project
      const { data: looksData } = await supabase
        .from("talent_looks")
        .select("id, name, digital_talent_id")
        .eq("project_id", projectId)
        .order("created_at");

      if (!looksData || looksData.length === 0) {
        setLooks([]);
        setTalentIds([]);
        return;
      }

      // Extract unique talent IDs from looks
      const uniqueTalentIds = [...new Set(looksData.map(l => l.digital_talent_id).filter(Boolean))] as string[];
      setTalentIds(uniqueTalentIds);

      // For each look, fetch its source images with crops
      const looksWithImages: LookWithImages[] = [];
      for (const look of looksData) {
        const { data: images } = await supabase
          .from("look_source_images")
          .select("*")
          .eq("look_id", look.id)
          .not("head_cropped_url", "is", null)
          .order("view");

        if (images && images.length > 0) {
          looksWithImages.push({
            id: look.id,
            name: look.name,
            digital_talent_id: look.digital_talent_id,
            sourceImages: images as LookSourceImage[],
          });
        }
      }
      setLooks(looksWithImages);
    };
    fetchLooks();
  }, [projectId]);

  // Fetch talent info from first derived talentId
  useEffect(() => {
    if (talentIds.length === 0) return;
    const fetchTalentInfo = async () => {
      const { data } = await supabase
        .from("digital_talents")
        .select("name, front_face_url")
        .eq("id", talentIds[0])
        .single();
      if (data) setTalentInfo(data);
    };
    fetchTalentInfo();
  }, [talentIds]);

  // Fetch face foundations for ALL talents in the project
  useEffect(() => {
    if (talentIds.length === 0) return;
    const fetchFaceFoundations = async () => {
      const { data } = await supabase
        .from("face_pairing_outputs")
        .select(`
          id,
          stored_url,
          pairing:face_pairings!inner(
            digital_talent_id,
            cropped_face_id
          )
        `)
        .eq("status", "completed")
        .eq("is_face_foundation", true)
        .not("stored_url", "is", null);

      if (data) {
        const foundations: FaceFoundation[] = [];

        for (const output of data) {
          const pairing = output.pairing as any;
          // Check if this foundation belongs to ANY talent in the project
          if (pairing?.digital_talent_id && talentIds.includes(pairing.digital_talent_id) && output.stored_url) {
            const { data: identityImage } = await supabase
              .from("face_identity_images")
              .select("view")
              .eq("scrape_image_id", pairing.cropped_face_id)
              .maybeSingle();

            foundations.push({
              id: output.id,
              stored_url: output.stored_url,
              view: (identityImage?.view as any) || "unknown",
              digital_talent_id: pairing.digital_talent_id,
            });
          }
        }

        setFaceFoundations(foundations);

        // Auto-match by view angle for all looks
        const allSourceImages = looks.flatMap((l) => l.sourceImages);
        const autoMatches: Record<string, string> = {};
        allSourceImages.forEach((img) => {
          const matchingFace = foundations.find((f) => f.view === img.view);
          if (matchingFace) {
            autoMatches[img.id] = matchingFace.stored_url;
          } else if (foundations.length > 0) {
            autoMatches[img.id] = foundations[0].stored_url;
          }
        });
        setMatches(autoMatches);
      }
    };
    fetchFaceFoundations();
  }, [talentIds, looks]);

  // Toggle face selection (click again to deselect)
  const handleSelectFace = (sourceImageId: string, faceUrl: string) => {
    setMatches((prev) => {
      if (prev[sourceImageId] === faceUrl) {
        // Deselect: remove from matches
        const { [sourceImageId]: _, ...rest } = prev;
        return rest;
      }
      // Select new face
      return { ...prev, [sourceImageId]: faceUrl };
    });
  };

  // Save matches to database and continue
  const handleContinue = async () => {
    setIsSaving(true);
    try {
      // Save face matches to look_source_images
      // We store the matched face URL in a way that GenerateTab can use
      const updates = Object.entries(matches).map(([sourceImageId, faceUrl]) => {
        // Find which talent this face belongs to
        const foundation = faceFoundations.find(f => f.stored_url === faceUrl);
        return {
          id: sourceImageId,
          digital_talent_id: foundation?.digital_talent_id || talentIds[0],
        };
      });

      // Update each source image with the matched talent
      for (const update of updates) {
        await supabase
          .from("look_source_images")
          .update({ digital_talent_id: update.digital_talent_id })
          .eq("id", update.id);
      }

      onContinue();
    } catch (error: any) {
      toast({ title: "Error saving matches", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  // Check matches - require at least one, not all
  const allSourceImages = looks.flatMap((l) => l.sourceImages);
  const matchedCount = allSourceImages.filter((img) => matches[img.id]).length;
  const hasAnyMatched = matchedCount > 0;

  const viewToAngle = (view: string): string => {
    switch (view) {
      case "front":
        return "front-facing";
      case "back":
        return "back view";
      case "side":
        return "side profile";
      case "detail":
        return "detail angle";
      default:
        return view;
    }
  };

  if (looks.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            No looks with cropped images found. Complete head crops in the previous step first.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex gap-6">
      {/* Main scrollable area */}
      <div className="flex-1 space-y-6 max-h-[75vh] overflow-y-auto pr-4">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Match Look Images to Face Foundations</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Select the appropriate face foundation for each look view. Click again to deselect.
          </p>
        </div>

        {looks.map((look) => (
          <Card key={look.id}>
            <CardHeader className="py-3">
              <CardTitle className="text-base">{look.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {look.sourceImages.map((img) => (
                <div
                  key={img.id}
                  className="grid grid-cols-[140px_1fr] gap-4 p-3 border rounded-lg bg-muted/30"
                >
                  {/* Look Image */}
                  <div className="space-y-1">
                    <p className="text-xs font-medium capitalize text-muted-foreground">
                      {img.view} View
                    </p>
                    <img
                      src={img.head_cropped_url ? `${img.head_cropped_url}?t=${Date.now()}` : img.source_url}
                      alt={img.view}
                      className="w-full aspect-square object-cover rounded-lg"
                    />
                  </div>

                  {/* Face Selection */}
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Select {viewToAngle(img.view)} face:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {faceFoundations.map((face) => (
                        <button
                          key={face.id}
                          onClick={() => handleSelectFace(img.id, face.stored_url)}
                          className={`
                            relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-all
                            ${matches[img.id] === face.stored_url
                              ? "border-primary ring-2 ring-primary/30"
                              : "border-transparent hover:border-muted-foreground/50"
                            }
                          `}
                        >
                          <img
                            src={face.stored_url}
                            alt={face.view}
                            className="w-full h-full object-cover"
                          />
                          {matches[img.id] === face.stored_url && (
                            <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                              <Check className="h-5 w-5 text-primary" />
                            </div>
                          )}
                          <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] py-0.5 text-center capitalize">
                            {face.view}
                          </span>
                        </button>
                      ))}
                    </div>
                    {faceFoundations.length === 0 && (
                      <p className="text-xs text-yellow-600">
                        No face foundations found. Create them in Talent Face Library first.
                      </p>
                    )}
                    {!matches[img.id] && faceFoundations.length > 0 && (
                      <p className="text-xs text-muted-foreground italic">No face selected</p>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}

        {/* Continue Button */}
        <div className="flex justify-end pt-4 pb-8">
          <Button
            size="lg"
            disabled={!hasAnyMatched || faceFoundations.length === 0 || isSaving}
            onClick={handleContinue}
          >
            {isSaving ? "Saving..." : `Continue to Generate (${matchedCount}/${allSourceImages.length} matched)`}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>

      {/* Sticky talent reference sidebar */}
      <div className="w-48 flex-shrink-0">
        <div className="sticky top-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Talent Reference</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              {talentInfo?.front_face_url ? (
                <img
                  src={talentInfo.front_face_url}
                  alt={talentInfo.name}
                  className="w-full aspect-square object-cover rounded-lg"
                />
              ) : (
                <div className="w-full aspect-square bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-xs text-muted-foreground">No image</span>
                </div>
              )}
              <p className="text-center text-sm font-medium mt-2">
                {talentInfo?.name || "Unknown"}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
