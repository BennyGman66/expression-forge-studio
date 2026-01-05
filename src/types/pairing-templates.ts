export interface PairingTemplate {
  id: string;
  name: string;
  digital_talent_id: string;
  digital_twin_id: string | null;
  face_identity_id: string | null;
  scrape_run_id: string | null;
  created_at: string;
  last_used_at: string | null;
  usage_count: number;
}

export interface PairingTemplateWithRelations extends PairingTemplate {
  digital_talent: {
    id: string;
    name: string;
    front_face_url: string | null;
    gender: string | null;
  };
  digital_twin?: {
    id: string;
    name: string;
    representative_image_url: string | null;
    gender: string | null;
  } | null;
  face_identity?: {
    id: string;
    name: string;
    gender: string;
    image_count: number;
  } | null;
}
