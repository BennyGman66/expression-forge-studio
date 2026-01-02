import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LookSourceImage, FaceFoundation } from "@/types/face-application";

interface FaceMatchTabProps {
  lookId: string | null;
  talentId: string | null;
  onContinue: () => void;
}

export function FaceMatchTab({ lookId, talentId, onContinue }: FaceMatchTabProps) {
  const [sourceImages, setSourceImages] = useState<LookSourceImage[]>([]);
  const [faceFoundations, setFaceFoundations] = useState<FaceFoundation[]>([]);
  const [matches, setMatches] = useState<Record<string, string>>({}); // sourceImageId -> faceUrl
  const { toast } = useToast();

  // Fetch source images
  useEffect(() => {
    if (!lookId) return;
    const fetchSourceImages = async () => {
      const { data } = await supabase
        .from("look_source_images")
        .select("*")
        .eq("look_id", lookId)
        .not("head_cropped_url", "is", null)
        .order("view");
      if (data) setSourceImages(data as LookSourceImage[]);
    };
    fetchSourceImages();
  }, [lookId]);

  // Fetch face foundations for the talent
  useEffect(() => {
    if (!talentId) return;
    const fetchFaceFoundations = async () => {
      // Get completed face pairing outputs marked as face foundations for this talent
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
        // Filter by talent and map to FaceFoundation format
        const foundations: FaceFoundation[] = [];
        
        for (const output of data) {
          const pairing = output.pairing as any;
          if (pairing?.digital_talent_id === talentId && output.stored_url) {
            // Get the view from the original image
            const { data: identityImage } = await supabase
              .from("face_identity_images")
              .select("view")
              .eq("scrape_image_id", pairing.cropped_face_id)
              .single();
            
            foundations.push({
              id: output.id,
              stored_url: output.stored_url,
              view: (identityImage?.view as any) || "unknown",
              digital_talent_id: talentId,
            });
          }
        }
        
        setFaceFoundations(foundations);

        // Auto-match by view angle
        const autoMatches: Record<string, string> = {};
        sourceImages.forEach((img) => {
          const matchingFace = foundations.find((f) => f.view === img.view);
          if (matchingFace) {
            autoMatches[img.id] = matchingFace.stored_url;
          } else if (foundations.length > 0) {
            // Default to first available
            autoMatches[img.id] = foundations[0].stored_url;
          }
        });
        setMatches(autoMatches);
      }
    };
    fetchFaceFoundations();
  }, [talentId, sourceImages]);

  const handleSelectFace = (sourceImageId: string, faceUrl: string) => {
    setMatches((prev) => ({ ...prev, [sourceImageId]: faceUrl }));
  };

  const allMatched = sourceImages.every((img) => matches[img.id]);

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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Match Look Images to Face Foundations</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-6">
            Select the appropriate face foundation for each look view. The system auto-suggests based on matching angles.
          </p>

          <div className="space-y-6">
            {sourceImages.map((img) => (
              <div
                key={img.id}
                className="grid grid-cols-[200px_1fr] gap-6 p-4 border rounded-lg"
              >
                {/* Look Image */}
                <div className="space-y-2">
                  <p className="text-sm font-medium capitalize">{img.view} View</p>
                  <img
                    src={img.head_cropped_url ? `${img.head_cropped_url}?t=${Date.now()}` : img.source_url}
                    alt={img.view}
                    className="w-full aspect-square object-cover rounded-lg"
                  />
                </div>

                {/* Face Selection */}
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Select {viewToAngle(img.view)} face:
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {faceFoundations.map((face) => (
                      <button
                        key={face.id}
                        onClick={() => handleSelectFace(img.id, face.stored_url)}
                        className={`
                          relative w-20 h-20 rounded-lg overflow-hidden border-2 transition-all
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
                            <Check className="h-6 w-6 text-primary" />
                          </div>
                        )}
                        <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs py-0.5 text-center capitalize">
                          {face.view}
                        </span>
                      </button>
                    ))}
                  </div>
                  {faceFoundations.length === 0 && (
                    <p className="text-sm text-yellow-600">
                      No face foundations found for this talent. Create them in Talent Face Library first.
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Continue Button */}
      <div className="flex justify-end">
        <Button
          size="lg"
          disabled={!allMatched || faceFoundations.length === 0}
          onClick={onContinue}
        >
          Continue to Generate
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
