export interface DigitalTalent {
  id: string;
  name: string;
  gender: string | null;
  front_face_url: string | null;
  created_at: string;
}

export interface DigitalTalentAsset {
  id: string;
  talent_id: string;
  asset_type: 'front_face' | 'expression_map' | 'rendered_head';
  stored_url: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface DigitalTalentWithUsage extends DigitalTalent {
  looks_count: number;
  outputs_count: number;
}
