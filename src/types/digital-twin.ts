export interface DigitalTwin {
  id: string;
  name: string;
  gender: string | null;
  brand_id: string | null;
  representative_image_url: string | null;
  source_scrape_run_id: string | null;
  image_count: number;
  usage_count: number;
  created_at: string;
}

export interface DigitalTwinImage {
  id: string;
  twin_id: string;
  source_url: string;
  stored_url: string | null;
  view: string;
  crop_data: {
    crop_x: number;
    crop_y: number;
    crop_width: number;
    crop_height: number;
  } | null;
  created_at: string;
}

export interface DigitalTwinWithBrand extends DigitalTwin {
  brand?: { id: string; name: string } | null;
}
