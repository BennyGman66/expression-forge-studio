export interface FacePairingJob {
  id: string;
  scrape_run_id: string | null;
  name: string;
  pairing_mode: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
  status: 'pending' | 'describing' | 'generating' | 'completed' | 'failed';
  total_pairings: number;
  progress: number;
  attempts_per_pairing: number;
  logs: Array<{ timestamp: string; message: string }>;
  created_at: string;
  updated_at: string;
}

export interface FacePairing {
  id: string;
  job_id: string;
  cropped_face_id: string;
  talent_id: string;
  talent_image_id: string;
  outfit_description: string | null;
  outfit_description_status: 'pending' | 'completed' | 'failed';
  status: 'pending' | 'generating' | 'completed' | 'failed';
  created_at: string;
}

export interface FacePairingOutput {
  id: string;
  pairing_id: string;
  attempt_index: number;
  final_prompt: string | null;
  stored_url: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error_message: string | null;
  created_at: string;
}

// Extended types with relations
export interface FacePairingWithDetails extends FacePairing {
  face_scrape_images?: {
    id: string;
    source_url: string;
    stored_url: string | null;
    gender: string;
    product_title: string | null;
  };
  talents?: {
    id: string;
    name: string;
    gender: string | null;
  };
  talent_images?: {
    id: string;
    stored_url: string;
    view: string;
  };
}

export interface FacePairingOutputWithDetails extends FacePairingOutput {
  face_pairings?: FacePairingWithDetails;
}

export interface SelectedCroppedFace {
  id: string;
  source_url: string;
  stored_url: string | null;
  gender: string;
  identity_name: string | null;
  view: string;
  brand_name: string;
}

export interface SelectedTalentImage {
  id: string;
  talent_id: string;
  talent_name: string;
  stored_url: string;
  view: string;
}

export type PairingMode = 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
