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
  paired: number;
  status: 'empty' | 'partial' | 'complete';
}

export function getLookPairingStatus(
  look: LookWithImages,
  pairings: Map<string, string>
): LookPairingStatus {
  const total = look.sourceImages.length;
  const paired = look.sourceImages.filter(img => pairings.has(img.id)).length;
  
  let status: 'empty' | 'partial' | 'complete' = 'empty';
  if (paired === total && total > 0) {
    status = 'complete';
  } else if (paired > 0) {
    status = 'partial';
  }
  
  return { total, paired, status };
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
