import { LookSourceImage, FaceFoundation } from "@/types/face-application";

export interface LookWithImages {
  id: string;
  name: string;
  digital_talent_id: string | null;
  sourceImages: LookSourceImage[];
}

export interface PairingState {
  // sourceImageId -> faceUrl
  pairings: Map<string, string>;
}

export interface LookPairingStatus {
  total: number;
  cropped: number;
  paired: number;
  status: 'needs_crop' | 'empty' | 'partial' | 'complete';
}

export function getLookPairingStatus(
  look: LookWithImages,
  pairings: Map<string, string>
): LookPairingStatus {
  const total = look.sourceImages.length;
  const cropped = look.sourceImages.filter(img => !!img.head_cropped_url).length;
  const paired = look.sourceImages.filter(img => !!img.head_cropped_url && pairings.has(img.id)).length;
  
  let status: 'needs_crop' | 'empty' | 'partial' | 'complete' = 'empty';
  
  if (cropped < total) {
    // Some images still need cropping
    status = 'needs_crop';
  } else if (paired === total && total > 0) {
    // All cropped AND all paired
    status = 'complete';
  } else if (paired > 0) {
    // Some paired
    status = 'partial';
  }
  
  return { total, cropped, paired, status };
}

export interface FaceMatchContextValue {
  looks: LookWithImages[];
  faceFoundations: FaceFoundation[];
  pairings: Map<string, string>;
  selectedLookId: string | null;
  setSelectedLookId: (id: string | null) => void;
  setPairing: (sourceImageId: string, faceUrl: string) => void;
  clearPairing: (sourceImageId: string) => void;
  applyAutoMatches: () => void;
  savePairings: () => Promise<void>;
  isSaving: boolean;
}
