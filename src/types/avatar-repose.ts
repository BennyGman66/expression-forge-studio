// Avatar Repose Types

export interface Brand {
  id: string;
  name: string;
  start_url: string;
  created_at: string;
}

export interface ScrapeJob {
  id: string;
  brand_id: string;
  status: string;
  progress: number | null;
  total: number | null;
  logs: unknown;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  brand_id: string;
  product_url: string;
  sku: string | null;
  gender: string | null;
  created_at: string;
}

export type ImageSlot = 'A' | 'B' | 'C' | 'D';

export interface ProductImage {
  id: string;
  product_id: string;
  slot: string;
  source_url: string;
  stored_url: string | null;
  created_at: string;
}

export interface ClayImage {
  id: string;
  product_image_id: string;
  stored_url: string;
  created_at: string;
}

export interface Talent {
  id: string;
  name: string;
  gender: string | null;
  created_at: string;
}

export interface TalentLook {
  id: string;
  talent_id: string;
  name: string;
  created_at: string;
}

export type TalentView = 'front' | 'back' | 'detail' | 'side';

export interface TalentImage {
  id: string;
  talent_id: string;
  look_id: string | null;
  view: string;
  stored_url: string;
  created_at: string;
}

export interface GenerationJob {
  id: string;
  brand_id: string;
  talent_id: string;
  view: string;
  slot: string;
  random_count: number;
  attempts_per_pose: number;
  status: string;
  progress: number | null;
  total: number | null;
  logs: unknown;
  created_at: string;
  updated_at: string;
}

export interface Generation {
  id: string;
  generation_job_id: string;
  pose_clay_image_id: string;
  attempt_index: number;
  stored_url: string;
  created_at: string;
}
