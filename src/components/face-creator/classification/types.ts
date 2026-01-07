export interface Identity {
  id: string;
  name: string;
  gender: string;
  image_count: number;
  representative_image_id: string | null;
  representative_image_url?: string | null;
  talent_id?: string | null;
  digital_talent?: DigitalTalent | null;
}

export interface DigitalTalent {
  id: string;
  name: string;
  gender: string | null;
  front_face_url: string | null;
}

export interface IdentityImage {
  id: string;
  identity_id: string;
  scrape_image_id: string;
  view: string | null;
  view_source: string | null;
  is_ignored: boolean | null;
  scrape_image: {
    id: string;
    stored_url: string | null;
    source_url: string;
    gender: string | null;
  } | null;
}

export interface UnclassifiedImage {
  id: string;
  stored_url: string | null;
  source_url: string;
  gender: string | null;
}

export type ViewType = 'front' | 'side' | 'back' | 'unknown';
export type GenderFilter = 'all' | 'men' | 'women';

export interface DragData {
  type: 'image';
  imageId: string;
  identityImageId: string;
  sourceIdentityId: string;
  scrapeImageId: string;
  imageUrl: string | null;
}
