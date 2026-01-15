import { useState } from "react";
import { Check, Wand2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LookWithImages, getLookPairingStatus } from "./types";
import { FaceFoundation, LookSourceImage } from "@/types/face-application";
import { ViewSlot } from "./ViewSlot";
import { InlineCropDialog } from "./InlineCropDialog";

interface LookPairingPanelProps {
  look: LookWithImages | null;
  faceFoundations: FaceFoundation[];
  pairings: Map<string, string>;
  onSetPairing: (sourceImageId: string, faceUrl: string) => void;
  onClearPairing: (sourceImageId: string) => void;
  onApplyAutoMatches: () => void;
  onCropComplete: (updatedImage: LookSourceImage) => void;
  dragOverSlotId: string | null;
}

export function LookPairingPanel({
  look,
  faceFoundations,
  pairings,
  onSetPairing,
  onClearPairing,
  onApplyAutoMatches,
  onCropComplete,
  dragOverSlotId,
}: LookPairingPanelProps) {
  const [cropDialogImage, setCropDialogImage] = useState<LookSourceImage | null>(null);

  if (!look) {
    return (
      <div className="flex-1 flex items-center justify-center text-center p-8">
        <div>
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Check className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <h3 className="text-lg font-medium text-muted-foreground">Select a look</h3>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Choose a look from the left panel to start pairing faces
          </p>
        </div>
      </div>
    );
  }

  const status = getLookPairingStatus(look, pairings);
  const talentFoundations = faceFoundations.filter(
    f => f.digital_talent_id === look.digital_talent_id
  );

  // Count cropped images only for auto-match check
  const croppedImages = look.sourceImages.filter(img => !!img.head_cropped_url);
  
  // Check if auto-matching would add any new pairings
  const canAutoMatch = croppedImages.some(img => {
    if (pairings.has(img.id)) return false;
    return talentFoundations.some(f => f.view === img.view) || talentFoundations.length > 0;
  });

  const handleCropClick = (sourceImage: LookSourceImage) => {
    setCropDialogImage(sourceImage);
  };

  const handleCropDialogComplete = (updatedImage: LookSourceImage) => {
    onCropComplete(updatedImage);
    setCropDialogImage(null);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-lg font-semibold">{look.name}</h3>
          <p className="text-sm text-muted-foreground">
            {status.cropped < status.total ? (
              <>
                <span className="text-rose-600 font-medium">
                  {status.total - status.cropped} need cropping
                </span>
                {" · "}
              </>
            ) : null}
            {status.paired}/{status.cropped} views paired
            {status.status === 'complete' && (
              <span className="ml-2 text-emerald-600 font-medium">✓ Complete</span>
            )}
          </p>
        </div>
        
        {canAutoMatch && (
          <Button
            variant="outline"
            size="sm"
            onClick={onApplyAutoMatches}
            className="gap-2"
          >
            <Wand2 className="h-4 w-4" />
            Auto-Match
          </Button>
        )}
      </div>

      {/* Needs crop banner */}
      {status.cropped < status.total && (
        <div className="px-4 py-2 bg-rose-50 border-b border-rose-100 flex items-center gap-2 text-rose-700 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            {status.total - status.cropped} image(s) need cropping before they can be matched. 
            Click "Crop Now" on each to crop inline.
          </span>
        </div>
      )}

      {/* View slots grid */}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-2 gap-4">
          {look.sourceImages.map((img) => (
            <ViewSlot
              key={img.id}
              sourceImage={img}
              pairedFaceUrl={pairings.get(img.id) || null}
              onClearPairing={() => onClearPairing(img.id)}
              onCropClick={() => handleCropClick(img)}
              isOver={dragOverSlotId === img.id}
            />
          ))}
        </div>

        {look.sourceImages.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p>No source images found for this look.</p>
            <p className="text-sm">Upload images in the Looks tab first.</p>
          </div>
        )}
      </div>

      {/* Inline crop dialog */}
      {cropDialogImage && (
        <InlineCropDialog
          open={!!cropDialogImage}
          onOpenChange={(open) => !open && setCropDialogImage(null)}
          sourceImage={cropDialogImage}
          onCropComplete={handleCropDialogComplete}
        />
      )}
    </div>
  );
}
