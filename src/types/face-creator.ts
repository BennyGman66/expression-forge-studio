export interface FaceScrapeRun {
  id: string;
  brand_name: string;
  start_url: string;
  max_products: number;
  images_per_product: number;
  status: 'pending' | 'mapping' | 'running' | 'completed' | 'failed';
  progress: number;
  total: number;
  logs: Array<{ timestamp: string; message: string }>;
  created_at: string;
  updated_at: string;
}

export interface FaceScrapeImage {
  id: string;
  scrape_run_id: string;
  source_url: string;
  stored_url: string | null;
  product_url: string | null;
  product_title: string | null;
  image_index: number;
  image_hash: string | null;
  gender: 'men' | 'women' | 'unknown';
  gender_source: 'url' | 'ai' | 'manual' | 'unknown';
  created_at: string;
}

export interface FaceDetection {
  id: string;
  scrape_image_id: string;
  face_count: number;
  status: 'pending' | 'detected' | 'no_face' | 'multiple_faces';
  bounding_boxes: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
  }>;
  primary_box_index: number;
  created_at: string;
}

export interface FaceIdentity {
  id: string;
  scrape_run_id: string;
  gender: 'men' | 'women';
  name: string;
  representative_image_id: string | null;
  image_count: number;
  created_at: string;
}

export interface FaceIdentityImage {
  id: string;
  identity_id: string;
  scrape_image_id: string;
  view: 'front' | 'side' | 'back' | 'unknown';
  view_source: 'auto' | 'manual';
  is_ignored: boolean;
  created_at: string;
}

export interface FaceCrop {
  id: string;
  scrape_image_id: string;
  crop_x: number;
  crop_y: number;
  crop_width: number;
  crop_height: number;
  aspect_ratio: '1:1' | '4:5';
  cropped_stored_url: string | null;
  is_auto: boolean;
  created_at: string;
  updated_at: string;
}

export interface FaceJob {
  id: string;
  scrape_run_id: string;
  type: 'scrape' | 'gender' | 'face_detection' | 'clustering' | 'view' | 'crop';
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  total: number;
  logs: Array<{ timestamp: string; message: string }>;
  created_at: string;
  updated_at: string;
}

// Extended types with relations
export interface FaceScrapeImageWithDetection extends FaceScrapeImage {
  face_detection?: FaceDetection;
  face_crop?: FaceCrop;
}

export interface FaceIdentityWithImages extends FaceIdentity {
  images: FaceScrapeImageWithDetection[];
  representative_image?: FaceScrapeImage;
}
