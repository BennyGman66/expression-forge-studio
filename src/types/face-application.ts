export interface LookSourceImage {
  id: string;
  look_id: string;
  digital_talent_id: string | null;
  view: 'front' | 'back' | 'side' | 'detail';
  source_url: string;
  head_crop_x: number | null;
  head_crop_y: number | null;
  head_crop_width: number | null;
  head_crop_height: number | null;
  head_cropped_url: string | null;
  created_at: string;
}

export interface FaceApplicationJob {
  id: string;
  look_id: string;
  digital_talent_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  model: string;
  attempts_per_view: number;
  progress: number;
  total: number;
  logs: Array<{ timestamp: string; message: string }>;
  created_at: string;
  updated_at: string;
}

export interface FaceApplicationOutput {
  id: string;
  job_id: string;
  look_source_image_id: string;
  face_foundation_url: string | null;
  view: string;
  attempt_index: number;
  outfit_description: string | null;
  final_prompt: string | null;
  stored_url: string | null;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  is_selected: boolean;
  created_at: string;
}

export interface FaceFoundation {
  id: string;
  stored_url: string;
  view: 'front' | 'side' | 'back' | 'unknown';
  digital_talent_id: string;
}
