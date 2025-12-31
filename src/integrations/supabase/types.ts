export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      brand_refs: {
        Row: {
          created_at: string
          file_name: string | null
          id: string
          image_url: string
          metadata_json: Json | null
          project_id: string
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          id?: string
          image_url: string
          metadata_json?: Json | null
          project_id: string
        }
        Update: {
          created_at?: string
          file_name?: string | null
          id?: string
          image_url?: string
          metadata_json?: Json | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_refs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          id: string
          name: string
          start_url: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          start_url: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          start_url?: string
        }
        Relationships: []
      }
      clay_images: {
        Row: {
          created_at: string
          id: string
          product_image_id: string
          stored_url: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_image_id: string
          stored_url: string
        }
        Update: {
          created_at?: string
          id?: string
          product_image_id?: string
          stored_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "clay_images_product_image_id_fkey"
            columns: ["product_image_id"]
            isOneToOne: true
            referencedRelation: "product_images"
            referencedColumns: ["id"]
          },
        ]
      }
      client_review_feedback: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          is_favorite: boolean | null
          item_id: string | null
          look_id: string | null
          review_id: string
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          is_favorite?: boolean | null
          item_id?: string | null
          look_id?: string | null
          review_id: string
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          is_favorite?: boolean | null
          item_id?: string | null
          look_id?: string | null
          review_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_review_feedback_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "client_review_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_review_feedback_look_id_fkey"
            columns: ["look_id"]
            isOneToOne: false
            referencedRelation: "talent_looks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_review_feedback_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "client_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      client_review_items: {
        Row: {
          created_at: string
          generation_id: string
          id: string
          look_id: string | null
          position: number
          review_id: string
          slot: string
        }
        Insert: {
          created_at?: string
          generation_id: string
          id?: string
          look_id?: string | null
          position?: number
          review_id: string
          slot: string
        }
        Update: {
          created_at?: string
          generation_id?: string
          id?: string
          look_id?: string | null
          position?: number
          review_id?: string
          slot?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_review_items_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_review_items_look_id_fkey"
            columns: ["look_id"]
            isOneToOne: false
            referencedRelation: "talent_looks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_review_items_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "client_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      client_reviews: {
        Row: {
          created_at: string
          generation_job_id: string | null
          id: string
          name: string
          password_hash: string | null
          project_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          generation_job_id?: string | null
          id?: string
          name: string
          password_hash?: string | null
          project_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          generation_job_id?: string | null
          id?: string
          name?: string
          password_hash?: string | null
          project_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_reviews_generation_job_id_fkey"
            columns: ["generation_job_id"]
            isOneToOne: false
            referencedRelation: "generation_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_reviews_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "external_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_model_refs: {
        Row: {
          created_at: string
          digital_model_id: string
          file_name: string | null
          id: string
          image_url: string
        }
        Insert: {
          created_at?: string
          digital_model_id: string
          file_name?: string | null
          id?: string
          image_url: string
        }
        Update: {
          created_at?: string
          digital_model_id?: string
          file_name?: string | null
          id?: string
          image_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "digital_model_refs_digital_model_id_fkey"
            columns: ["digital_model_id"]
            isOneToOne: false
            referencedRelation: "digital_models"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_models: {
        Row: {
          created_at: string
          id: string
          name: string
          project_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          project_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "digital_models_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_talent_assets: {
        Row: {
          asset_type: string
          created_at: string
          id: string
          metadata: Json | null
          stored_url: string
          talent_id: string
        }
        Insert: {
          asset_type?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          stored_url: string
          talent_id: string
        }
        Update: {
          asset_type?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          stored_url?: string
          talent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "digital_talent_assets_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "digital_talents"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_talent_brands: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          talent_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          talent_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          talent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "digital_talent_brands_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_talent_brands_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "digital_talents"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_talents: {
        Row: {
          created_at: string
          front_face_url: string | null
          gender: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          front_face_url?: string | null
          gender?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          front_face_url?: string | null
          gender?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      expression_map_exports: {
        Row: {
          created_at: string
          id: string
          image_urls: Json
          name: string
          output_ids: Json
          project_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_urls?: Json
          name: string
          output_ids?: Json
          project_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_urls?: Json
          name?: string
          output_ids?: Json
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expression_map_exports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      expression_recipes: {
        Row: {
          created_at: string
          delta_line: string | null
          full_prompt_text: string | null
          id: string
          name: string
          project_id: string
          recipe_json: Json
          source_image_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          delta_line?: string | null
          full_prompt_text?: string | null
          id?: string
          name: string
          project_id: string
          recipe_json?: Json
          source_image_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          delta_line?: string | null
          full_prompt_text?: string | null
          id?: string
          name?: string
          project_id?: string
          recipe_json?: Json
          source_image_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expression_recipes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expression_recipes_source_image_id_fkey"
            columns: ["source_image_id"]
            isOneToOne: false
            referencedRelation: "brand_refs"
            referencedColumns: ["id"]
          },
        ]
      }
      external_clients: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      external_projects: {
        Row: {
          client_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "external_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      face_crops: {
        Row: {
          aspect_ratio: string
          created_at: string
          crop_height: number
          crop_width: number
          crop_x: number
          crop_y: number
          cropped_stored_url: string | null
          id: string
          is_auto: boolean | null
          scrape_image_id: string
          updated_at: string
        }
        Insert: {
          aspect_ratio?: string
          created_at?: string
          crop_height: number
          crop_width: number
          crop_x: number
          crop_y: number
          cropped_stored_url?: string | null
          id?: string
          is_auto?: boolean | null
          scrape_image_id: string
          updated_at?: string
        }
        Update: {
          aspect_ratio?: string
          created_at?: string
          crop_height?: number
          crop_width?: number
          crop_x?: number
          crop_y?: number
          cropped_stored_url?: string | null
          id?: string
          is_auto?: boolean | null
          scrape_image_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "face_crops_scrape_image_id_fkey"
            columns: ["scrape_image_id"]
            isOneToOne: false
            referencedRelation: "face_scrape_images"
            referencedColumns: ["id"]
          },
        ]
      }
      face_detections: {
        Row: {
          bounding_boxes: Json | null
          created_at: string
          face_count: number
          id: string
          primary_box_index: number | null
          scrape_image_id: string
          status: string
        }
        Insert: {
          bounding_boxes?: Json | null
          created_at?: string
          face_count?: number
          id?: string
          primary_box_index?: number | null
          scrape_image_id: string
          status?: string
        }
        Update: {
          bounding_boxes?: Json | null
          created_at?: string
          face_count?: number
          id?: string
          primary_box_index?: number | null
          scrape_image_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "face_detections_scrape_image_id_fkey"
            columns: ["scrape_image_id"]
            isOneToOne: false
            referencedRelation: "face_scrape_images"
            referencedColumns: ["id"]
          },
        ]
      }
      face_identities: {
        Row: {
          created_at: string
          gender: string
          id: string
          image_count: number
          name: string
          representative_image_id: string | null
          scrape_run_id: string
          talent_id: string | null
        }
        Insert: {
          created_at?: string
          gender: string
          id?: string
          image_count?: number
          name: string
          representative_image_id?: string | null
          scrape_run_id: string
          talent_id?: string | null
        }
        Update: {
          created_at?: string
          gender?: string
          id?: string
          image_count?: number
          name?: string
          representative_image_id?: string | null
          scrape_run_id?: string
          talent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "face_identities_representative_image_id_fkey"
            columns: ["representative_image_id"]
            isOneToOne: false
            referencedRelation: "face_scrape_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "face_identities_scrape_run_id_fkey"
            columns: ["scrape_run_id"]
            isOneToOne: false
            referencedRelation: "face_scrape_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "face_identities_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talents"
            referencedColumns: ["id"]
          },
        ]
      }
      face_identity_images: {
        Row: {
          created_at: string
          id: string
          identity_id: string
          is_ignored: boolean | null
          scrape_image_id: string
          view: string | null
          view_source: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          identity_id: string
          is_ignored?: boolean | null
          scrape_image_id: string
          view?: string | null
          view_source?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          identity_id?: string
          is_ignored?: boolean | null
          scrape_image_id?: string
          view?: string | null
          view_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "face_identity_images_identity_id_fkey"
            columns: ["identity_id"]
            isOneToOne: false
            referencedRelation: "face_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "face_identity_images_scrape_image_id_fkey"
            columns: ["scrape_image_id"]
            isOneToOne: false
            referencedRelation: "face_scrape_images"
            referencedColumns: ["id"]
          },
        ]
      }
      face_jobs: {
        Row: {
          created_at: string
          id: string
          logs: Json | null
          progress: number | null
          scrape_run_id: string
          status: string
          total: number | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          logs?: Json | null
          progress?: number | null
          scrape_run_id: string
          status?: string
          total?: number | null
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          logs?: Json | null
          progress?: number | null
          scrape_run_id?: string
          status?: string
          total?: number | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "face_jobs_scrape_run_id_fkey"
            columns: ["scrape_run_id"]
            isOneToOne: false
            referencedRelation: "face_scrape_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      face_pairing_jobs: {
        Row: {
          attempts_per_pairing: number | null
          created_at: string
          id: string
          logs: Json | null
          name: string
          pairing_mode: string
          progress: number | null
          scrape_run_id: string | null
          status: string
          total_pairings: number | null
          updated_at: string
        }
        Insert: {
          attempts_per_pairing?: number | null
          created_at?: string
          id?: string
          logs?: Json | null
          name?: string
          pairing_mode?: string
          progress?: number | null
          scrape_run_id?: string | null
          status?: string
          total_pairings?: number | null
          updated_at?: string
        }
        Update: {
          attempts_per_pairing?: number | null
          created_at?: string
          id?: string
          logs?: Json | null
          name?: string
          pairing_mode?: string
          progress?: number | null
          scrape_run_id?: string | null
          status?: string
          total_pairings?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "face_pairing_jobs_scrape_run_id_fkey"
            columns: ["scrape_run_id"]
            isOneToOne: false
            referencedRelation: "face_scrape_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      face_pairing_outputs: {
        Row: {
          attempt_index: number
          created_at: string
          error_message: string | null
          final_prompt: string | null
          id: string
          pairing_id: string
          status: string
          stored_url: string | null
        }
        Insert: {
          attempt_index?: number
          created_at?: string
          error_message?: string | null
          final_prompt?: string | null
          id?: string
          pairing_id: string
          status?: string
          stored_url?: string | null
        }
        Update: {
          attempt_index?: number
          created_at?: string
          error_message?: string | null
          final_prompt?: string | null
          id?: string
          pairing_id?: string
          status?: string
          stored_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "face_pairing_outputs_pairing_id_fkey"
            columns: ["pairing_id"]
            isOneToOne: false
            referencedRelation: "face_pairings"
            referencedColumns: ["id"]
          },
        ]
      }
      face_pairings: {
        Row: {
          created_at: string
          cropped_face_id: string
          digital_talent_id: string | null
          id: string
          job_id: string
          outfit_description: string | null
          outfit_description_status: string | null
          status: string
          talent_id: string
          talent_image_id: string
        }
        Insert: {
          created_at?: string
          cropped_face_id: string
          digital_talent_id?: string | null
          id?: string
          job_id: string
          outfit_description?: string | null
          outfit_description_status?: string | null
          status?: string
          talent_id: string
          talent_image_id: string
        }
        Update: {
          created_at?: string
          cropped_face_id?: string
          digital_talent_id?: string | null
          id?: string
          job_id?: string
          outfit_description?: string | null
          outfit_description_status?: string | null
          status?: string
          talent_id?: string
          talent_image_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "face_pairings_cropped_face_id_fkey"
            columns: ["cropped_face_id"]
            isOneToOne: false
            referencedRelation: "face_scrape_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "face_pairings_digital_talent_id_fkey"
            columns: ["digital_talent_id"]
            isOneToOne: false
            referencedRelation: "digital_talents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "face_pairings_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "face_pairing_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "face_pairings_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "face_pairings_talent_image_id_fkey"
            columns: ["talent_image_id"]
            isOneToOne: false
            referencedRelation: "talent_images"
            referencedColumns: ["id"]
          },
        ]
      }
      face_scrape_images: {
        Row: {
          created_at: string
          gender: string | null
          gender_source: string | null
          id: string
          image_hash: string | null
          image_index: number
          product_title: string | null
          product_url: string | null
          scrape_run_id: string
          source_url: string
          stored_url: string | null
        }
        Insert: {
          created_at?: string
          gender?: string | null
          gender_source?: string | null
          id?: string
          image_hash?: string | null
          image_index?: number
          product_title?: string | null
          product_url?: string | null
          scrape_run_id: string
          source_url: string
          stored_url?: string | null
        }
        Update: {
          created_at?: string
          gender?: string | null
          gender_source?: string | null
          id?: string
          image_hash?: string | null
          image_index?: number
          product_title?: string | null
          product_url?: string | null
          scrape_run_id?: string
          source_url?: string
          stored_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "face_scrape_images_scrape_run_id_fkey"
            columns: ["scrape_run_id"]
            isOneToOne: false
            referencedRelation: "face_scrape_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      face_scrape_runs: {
        Row: {
          brand_name: string
          created_at: string
          id: string
          images_per_product: number
          logs: Json | null
          max_products: number
          progress: number | null
          start_url: string
          status: string
          total: number | null
          updated_at: string
        }
        Insert: {
          brand_name: string
          created_at?: string
          id?: string
          images_per_product?: number
          logs?: Json | null
          max_products?: number
          progress?: number | null
          start_url: string
          status?: string
          total?: number | null
          updated_at?: string
        }
        Update: {
          brand_name?: string
          created_at?: string
          id?: string
          images_per_product?: number
          logs?: Json | null
          max_products?: number
          progress?: number | null
          start_url?: string
          status?: string
          total?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      generation_jobs: {
        Row: {
          attempts_per_pose: number | null
          brand_id: string
          created_at: string
          id: string
          logs: Json | null
          look_id: string | null
          progress: number | null
          random_count: number | null
          slot: string
          status: string
          talent_id: string
          talent_image_id: string | null
          total: number | null
          updated_at: string
          view: string
        }
        Insert: {
          attempts_per_pose?: number | null
          brand_id: string
          created_at?: string
          id?: string
          logs?: Json | null
          look_id?: string | null
          progress?: number | null
          random_count?: number | null
          slot: string
          status?: string
          talent_id: string
          talent_image_id?: string | null
          total?: number | null
          updated_at?: string
          view: string
        }
        Update: {
          attempts_per_pose?: number | null
          brand_id?: string
          created_at?: string
          id?: string
          logs?: Json | null
          look_id?: string | null
          progress?: number | null
          random_count?: number | null
          slot?: string
          status?: string
          talent_id?: string
          talent_image_id?: string | null
          total?: number | null
          updated_at?: string
          view?: string
        }
        Relationships: [
          {
            foreignKeyName: "generation_jobs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_jobs_look_id_fkey"
            columns: ["look_id"]
            isOneToOne: false
            referencedRelation: "talent_looks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_jobs_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_jobs_talent_image_id_fkey"
            columns: ["talent_image_id"]
            isOneToOne: false
            referencedRelation: "talent_images"
            referencedColumns: ["id"]
          },
        ]
      }
      generations: {
        Row: {
          attempt_index: number
          created_at: string
          generation_job_id: string
          id: string
          look_id: string | null
          pose_clay_image_id: string
          slot: string | null
          stored_url: string
          talent_image_id: string | null
          view: string | null
        }
        Insert: {
          attempt_index: number
          created_at?: string
          generation_job_id: string
          id?: string
          look_id?: string | null
          pose_clay_image_id: string
          slot?: string | null
          stored_url: string
          talent_image_id?: string | null
          view?: string | null
        }
        Update: {
          attempt_index?: number
          created_at?: string
          generation_job_id?: string
          id?: string
          look_id?: string | null
          pose_clay_image_id?: string
          slot?: string | null
          stored_url?: string
          talent_image_id?: string | null
          view?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generations_generation_job_id_fkey"
            columns: ["generation_job_id"]
            isOneToOne: false
            referencedRelation: "generation_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generations_look_id_fkey"
            columns: ["look_id"]
            isOneToOne: false
            referencedRelation: "talent_looks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generations_pose_clay_image_id_fkey"
            columns: ["pose_clay_image_id"]
            isOneToOne: false
            referencedRelation: "clay_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generations_talent_image_id_fkey"
            columns: ["talent_image_id"]
            isOneToOne: false
            referencedRelation: "talent_images"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          brand_id: string | null
          created_at: string
          id: string
          logs: Json | null
          progress: number | null
          project_id: string | null
          result: Json | null
          status: string
          total: number | null
          type: string
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          id?: string
          logs?: Json | null
          progress?: number | null
          project_id?: string | null
          result?: Json | null
          status?: string
          total?: number | null
          type: string
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          id?: string
          logs?: Json | null
          progress?: number | null
          project_id?: string | null
          result?: Json | null
          status?: string
          total?: number | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      outputs: {
        Row: {
          created_at: string
          digital_model_id: string | null
          id: string
          image_url: string | null
          metrics_json: Json | null
          project_id: string
          prompt_used: string | null
          recipe_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          digital_model_id?: string | null
          id?: string
          image_url?: string | null
          metrics_json?: Json | null
          project_id: string
          prompt_used?: string | null
          recipe_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          digital_model_id?: string | null
          id?: string
          image_url?: string | null
          metrics_json?: Json | null
          project_id?: string
          prompt_used?: string | null
          recipe_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "outputs_digital_model_id_fkey"
            columns: ["digital_model_id"]
            isOneToOne: false
            referencedRelation: "digital_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outputs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outputs_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "expression_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          created_at: string
          id: string
          product_id: string
          slot: string
          source_url: string
          stored_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          slot: string
          source_url: string
          stored_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          slot?: string
          source_url?: string
          stored_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand_id: string
          created_at: string
          gender: string | null
          id: string
          product_type: string | null
          product_url: string
          sku: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          gender?: string | null
          id?: string
          product_type?: string | null
          product_url: string
          sku?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          gender?: string | null
          id?: string
          product_type?: string | null
          product_url?: string
          sku?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          id: string
          master_prompt: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          master_prompt?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          master_prompt?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      prompt_templates: {
        Row: {
          created_at: string
          id: string
          key: string
          prompt: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          prompt: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          prompt?: string
          updated_at?: string
        }
        Relationships: []
      }
      scrape_jobs: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          logs: Json | null
          progress: number | null
          status: string
          total: number | null
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          logs?: Json | null
          progress?: number | null
          status?: string
          total?: number | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          logs?: Json | null
          progress?: number | null
          status?: string
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scrape_jobs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_images: {
        Row: {
          created_at: string
          id: string
          look_id: string | null
          stored_url: string
          talent_id: string
          view: string
        }
        Insert: {
          created_at?: string
          id?: string
          look_id?: string | null
          stored_url: string
          talent_id: string
          view: string
        }
        Update: {
          created_at?: string
          id?: string
          look_id?: string | null
          stored_url?: string
          talent_id?: string
          view?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_images_look_id_fkey"
            columns: ["look_id"]
            isOneToOne: false
            referencedRelation: "talent_looks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_images_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talents"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_looks: {
        Row: {
          created_at: string
          digital_talent_id: string | null
          id: string
          name: string
          product_type: string | null
          talent_id: string
        }
        Insert: {
          created_at?: string
          digital_talent_id?: string | null
          id?: string
          name: string
          product_type?: string | null
          talent_id: string
        }
        Update: {
          created_at?: string
          digital_talent_id?: string | null
          id?: string
          name?: string
          product_type?: string | null
          talent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_looks_digital_talent_id_fkey"
            columns: ["digital_talent_id"]
            isOneToOne: false
            referencedRelation: "digital_talents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_looks_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talents"
            referencedColumns: ["id"]
          },
        ]
      }
      talents: {
        Row: {
          created_at: string
          gender: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          gender?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          gender?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
