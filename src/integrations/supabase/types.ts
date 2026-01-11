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
      ai_apply_jobs: {
        Row: {
          attempts_per_view: number | null
          created_at: string | null
          digital_talent_id: string | null
          id: string
          look_id: string | null
          model: string | null
          pipeline_job_id: string | null
          progress: number | null
          project_id: string | null
          status: string | null
          strictness: string | null
          total: number | null
          updated_at: string | null
        }
        Insert: {
          attempts_per_view?: number | null
          created_at?: string | null
          digital_talent_id?: string | null
          id?: string
          look_id?: string | null
          model?: string | null
          pipeline_job_id?: string | null
          progress?: number | null
          project_id?: string | null
          status?: string | null
          strictness?: string | null
          total?: number | null
          updated_at?: string | null
        }
        Update: {
          attempts_per_view?: number | null
          created_at?: string | null
          digital_talent_id?: string | null
          id?: string
          look_id?: string | null
          model?: string | null
          pipeline_job_id?: string | null
          progress?: number | null
          project_id?: string | null
          status?: string | null
          strictness?: string | null
          total?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_apply_jobs_look_id_fkey"
            columns: ["look_id"]
            isOneToOne: false
            referencedRelation: "talent_looks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_apply_jobs_pipeline_job_id_fkey"
            columns: ["pipeline_job_id"]
            isOneToOne: false
            referencedRelation: "pipeline_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_apply_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "face_application_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_apply_outputs: {
        Row: {
          attempt_index: number | null
          body_image_id: string | null
          body_image_url: string | null
          created_at: string | null
          error_message: string | null
          final_prompt: string | null
          head_image_id: string | null
          head_image_url: string | null
          id: string
          is_selected: boolean | null
          job_id: string | null
          look_id: string | null
          needs_human_fix: boolean | null
          prompt_version: string | null
          status: string | null
          stored_url: string | null
          view: string
        }
        Insert: {
          attempt_index?: number | null
          body_image_id?: string | null
          body_image_url?: string | null
          created_at?: string | null
          error_message?: string | null
          final_prompt?: string | null
          head_image_id?: string | null
          head_image_url?: string | null
          id?: string
          is_selected?: boolean | null
          job_id?: string | null
          look_id?: string | null
          needs_human_fix?: boolean | null
          prompt_version?: string | null
          status?: string | null
          stored_url?: string | null
          view: string
        }
        Update: {
          attempt_index?: number | null
          body_image_id?: string | null
          body_image_url?: string | null
          created_at?: string | null
          error_message?: string | null
          final_prompt?: string | null
          head_image_id?: string | null
          head_image_url?: string | null
          id?: string
          is_selected?: boolean | null
          job_id?: string | null
          look_id?: string | null
          needs_human_fix?: boolean | null
          prompt_version?: string | null
          status?: string | null
          stored_url?: string | null
          view?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_apply_outputs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "ai_apply_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_apply_outputs_look_id_fkey"
            columns: ["look_id"]
            isOneToOne: false
            referencedRelation: "talent_looks"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_apply_prompt_templates: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          template: string
          version: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          template: string
          version: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          template?: string
          version?: string
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          action: string
          created_at: string | null
          id: string
          job_id: string | null
          metadata: Json | null
          project_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          job_id?: string | null
          metadata?: Json | null
          project_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          job_id?: string | null
          metadata?: Json | null
          project_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_pose_libraries: {
        Row: {
          brand_id: string
          config_json: Json | null
          created_at: string
          id: string
          locked_at: string | null
          locked_by: string | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          brand_id: string
          config_json?: Json | null
          created_at?: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          brand_id?: string
          config_json?: Json | null
          created_at?: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "brand_pose_libraries_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
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
      crop_corrections: {
        Row: {
          ai_crop_height: number
          ai_crop_width: number
          ai_crop_x: number
          ai_crop_y: number
          created_at: string
          delta_height: number | null
          delta_width: number | null
          delta_x: number | null
          delta_y: number | null
          id: string
          scrape_image_id: string
          scrape_run_id: string
          user_crop_height: number
          user_crop_width: number
          user_crop_x: number
          user_crop_y: number
          view_type: string
        }
        Insert: {
          ai_crop_height: number
          ai_crop_width: number
          ai_crop_x: number
          ai_crop_y: number
          created_at?: string
          delta_height?: number | null
          delta_width?: number | null
          delta_x?: number | null
          delta_y?: number | null
          id?: string
          scrape_image_id: string
          scrape_run_id: string
          user_crop_height: number
          user_crop_width: number
          user_crop_x: number
          user_crop_y: number
          view_type?: string
        }
        Update: {
          ai_crop_height?: number
          ai_crop_width?: number
          ai_crop_x?: number
          ai_crop_y?: number
          created_at?: string
          delta_height?: number | null
          delta_width?: number | null
          delta_x?: number | null
          delta_y?: number | null
          id?: string
          scrape_image_id?: string
          scrape_run_id?: string
          user_crop_height?: number
          user_crop_width?: number
          user_crop_x?: number
          user_crop_y?: number
          view_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "crop_corrections_scrape_image_id_fkey"
            columns: ["scrape_image_id"]
            isOneToOne: false
            referencedRelation: "face_scrape_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crop_corrections_scrape_run_id_fkey"
            columns: ["scrape_run_id"]
            isOneToOne: false
            referencedRelation: "face_scrape_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      crop_reference_images: {
        Row: {
          created_at: string
          cropped_image_url: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          original_image_url: string
          view_type: string
        }
        Insert: {
          created_at?: string
          cropped_image_url: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          original_image_url: string
          view_type?: string
        }
        Update: {
          created_at?: string
          cropped_image_url?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          original_image_url?: string
          view_type?: string
        }
        Relationships: []
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
      digital_twin_images: {
        Row: {
          created_at: string | null
          crop_data: Json | null
          id: string
          source_url: string
          stored_url: string | null
          twin_id: string
          view: string | null
        }
        Insert: {
          created_at?: string | null
          crop_data?: Json | null
          id?: string
          source_url: string
          stored_url?: string | null
          twin_id: string
          view?: string | null
        }
        Update: {
          created_at?: string | null
          crop_data?: Json | null
          id?: string
          source_url?: string
          stored_url?: string | null
          twin_id?: string
          view?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "digital_twin_images_twin_id_fkey"
            columns: ["twin_id"]
            isOneToOne: false
            referencedRelation: "digital_twins"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_twins: {
        Row: {
          brand_id: string | null
          created_at: string | null
          gender: string | null
          id: string
          image_count: number | null
          name: string
          representative_image_url: string | null
          source_scrape_run_id: string | null
          usage_count: number | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string | null
          gender?: string | null
          id?: string
          image_count?: number | null
          name: string
          representative_image_url?: string | null
          source_scrape_run_id?: string | null
          usage_count?: number | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string | null
          gender?: string | null
          id?: string
          image_count?: number | null
          name?: string
          representative_image_url?: string | null
          source_scrape_run_id?: string | null
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "digital_twins_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_twins_source_scrape_run_id_fkey"
            columns: ["source_scrape_run_id"]
            isOneToOne: false
            referencedRelation: "face_scrape_runs"
            referencedColumns: ["id"]
          },
        ]
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
      face_application_jobs: {
        Row: {
          attempts_per_view: number | null
          created_at: string | null
          digital_talent_id: string
          id: string
          logs: Json | null
          look_id: string
          model: string | null
          progress: number | null
          project_id: string | null
          status: string | null
          total: number | null
          updated_at: string | null
        }
        Insert: {
          attempts_per_view?: number | null
          created_at?: string | null
          digital_talent_id: string
          id?: string
          logs?: Json | null
          look_id: string
          model?: string | null
          progress?: number | null
          project_id?: string | null
          status?: string | null
          total?: number | null
          updated_at?: string | null
        }
        Update: {
          attempts_per_view?: number | null
          created_at?: string | null
          digital_talent_id?: string
          id?: string
          logs?: Json | null
          look_id?: string
          model?: string | null
          progress?: number | null
          project_id?: string | null
          status?: string | null
          total?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "face_application_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "face_application_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      face_application_outputs: {
        Row: {
          attempt_index: number | null
          created_at: string | null
          face_foundation_url: string | null
          final_prompt: string | null
          id: string
          is_selected: boolean | null
          job_id: string | null
          look_source_image_id: string | null
          outfit_description: string | null
          status: string | null
          stored_url: string | null
          view: string
        }
        Insert: {
          attempt_index?: number | null
          created_at?: string | null
          face_foundation_url?: string | null
          final_prompt?: string | null
          id?: string
          is_selected?: boolean | null
          job_id?: string | null
          look_source_image_id?: string | null
          outfit_description?: string | null
          status?: string | null
          stored_url?: string | null
          view: string
        }
        Update: {
          attempt_index?: number | null
          created_at?: string | null
          face_foundation_url?: string | null
          final_prompt?: string | null
          id?: string
          is_selected?: boolean | null
          job_id?: string | null
          look_source_image_id?: string | null
          outfit_description?: string | null
          status?: string | null
          stored_url?: string | null
          view?: string
        }
        Relationships: [
          {
            foreignKeyName: "face_application_outputs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "face_application_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "face_application_outputs_look_source_image_id_fkey"
            columns: ["look_source_image_id"]
            isOneToOne: false
            referencedRelation: "look_source_images"
            referencedColumns: ["id"]
          },
        ]
      }
      face_application_projects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
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
          archived_at: string | null
          archived_to_twin_id: string | null
          created_at: string
          digital_talent_id: string | null
          gender: string
          id: string
          image_count: number
          linked_twin_id: string | null
          name: string
          representative_image_id: string | null
          scrape_run_id: string
          talent_id: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_to_twin_id?: string | null
          created_at?: string
          digital_talent_id?: string | null
          gender: string
          id?: string
          image_count?: number
          linked_twin_id?: string | null
          name: string
          representative_image_id?: string | null
          scrape_run_id: string
          talent_id?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_to_twin_id?: string | null
          created_at?: string
          digital_talent_id?: string | null
          gender?: string
          id?: string
          image_count?: number
          linked_twin_id?: string | null
          name?: string
          representative_image_id?: string | null
          scrape_run_id?: string
          talent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "face_identities_archived_to_twin_id_fkey"
            columns: ["archived_to_twin_id"]
            isOneToOne: false
            referencedRelation: "digital_twins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "face_identities_digital_talent_id_fkey"
            columns: ["digital_talent_id"]
            isOneToOne: false
            referencedRelation: "digital_talents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "face_identities_linked_twin_id_fkey"
            columns: ["linked_twin_id"]
            isOneToOne: false
            referencedRelation: "digital_twins"
            referencedColumns: ["id"]
          },
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
          model: string | null
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
          model?: string | null
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
          model?: string | null
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
          is_face_foundation: boolean | null
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
          is_face_foundation?: boolean | null
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
          is_face_foundation?: boolean | null
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
          talent_id: string | null
          talent_image_id: string | null
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
          talent_id?: string | null
          talent_image_id?: string | null
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
          talent_id?: string | null
          talent_image_id?: string | null
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
          pipeline_job_id: string | null
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
          pipeline_job_id?: string | null
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
          pipeline_job_id?: string | null
          progress?: number | null
          start_url?: string
          status?: string
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "face_scrape_runs_pipeline_job_id_fkey"
            columns: ["pipeline_job_id"]
            isOneToOne: false
            referencedRelation: "pipeline_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      freelancer_identities: {
        Row: {
          display_name: string | null
          first_name: string
          first_seen_at: string | null
          id: string
          last_active_at: string | null
          last_name: string
        }
        Insert: {
          display_name?: string | null
          first_name: string
          first_seen_at?: string | null
          id?: string
          last_active_at?: string | null
          last_name: string
        }
        Update: {
          display_name?: string | null
          first_name?: string
          first_seen_at?: string | null
          id?: string
          last_active_at?: string | null
          last_name?: string
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
      image_annotations: {
        Row: {
          asset_id: string
          created_at: string
          created_by_user_id: string | null
          id: string
          rect: Json
          shape_type: Database["public"]["Enums"]["annotation_shape"]
          style: Json
        }
        Insert: {
          asset_id: string
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          rect?: Json
          shape_type?: Database["public"]["Enums"]["annotation_shape"]
          style?: Json
        }
        Update: {
          asset_id?: string
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          rect?: Json
          shape_type?: Database["public"]["Enums"]["annotation_shape"]
          style?: Json
        }
        Relationships: [
          {
            foreignKeyName: "image_annotations_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "submission_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "image_annotations_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          created_at: string | null
          created_by: string | null
          email: string | null
          expires_at: string
          id: string
          job_id: string | null
          pin_code: string | null
          project_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          expires_at: string
          id?: string
          job_id?: string | null
          pin_code?: string | null
          project_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          expires_at?: string
          id?: string
          job_id?: string | null
          pin_code?: string | null
          project_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "unified_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_groups: {
        Row: {
          brief: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          project_id: string | null
          total_looks: number
        }
        Insert: {
          brief: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          project_id?: string | null
          total_looks?: number
        }
        Update: {
          brief?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          project_id?: string | null
          total_looks?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_groups_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "face_application_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      job_inputs: {
        Row: {
          artifact_id: string | null
          created_at: string | null
          id: string
          job_id: string
          label: string | null
        }
        Insert: {
          artifact_id?: string | null
          created_at?: string | null
          id?: string
          job_id: string
          label?: string | null
        }
        Update: {
          artifact_id?: string | null
          created_at?: string | null
          id?: string
          job_id?: string
          label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_inputs_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "unified_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_inputs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "unified_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_notes: {
        Row: {
          author_id: string | null
          body: string
          created_at: string | null
          id: string
          job_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string | null
          id?: string
          job_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string | null
          id?: string
          job_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_notes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "unified_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_outputs: {
        Row: {
          artifact_id: string | null
          created_at: string | null
          file_url: string | null
          freelancer_identity_id: string | null
          id: string
          job_id: string
          label: string | null
          uploaded_by: string | null
        }
        Insert: {
          artifact_id?: string | null
          created_at?: string | null
          file_url?: string | null
          freelancer_identity_id?: string | null
          id?: string
          job_id: string
          label?: string | null
          uploaded_by?: string | null
        }
        Update: {
          artifact_id?: string | null
          created_at?: string | null
          file_url?: string | null
          freelancer_identity_id?: string | null
          id?: string
          job_id?: string
          label?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_outputs_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "unified_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_outputs_freelancer_identity_id_fkey"
            columns: ["freelancer_identity_id"]
            isOneToOne: false
            referencedRelation: "freelancer_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_outputs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "unified_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_outputs_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      job_submissions: {
        Row: {
          created_at: string
          freelancer_identity_id: string | null
          id: string
          job_id: string
          status: Database["public"]["Enums"]["submission_status"]
          submitted_at: string
          submitted_by_user_id: string | null
          summary_note: string | null
          updated_at: string
          version_number: number
        }
        Insert: {
          created_at?: string
          freelancer_identity_id?: string | null
          id?: string
          job_id: string
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_at?: string
          submitted_by_user_id?: string | null
          summary_note?: string | null
          updated_at?: string
          version_number?: number
        }
        Update: {
          created_at?: string
          freelancer_identity_id?: string | null
          id?: string
          job_id?: string
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_at?: string
          submitted_by_user_id?: string | null
          summary_note?: string | null
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_submissions_freelancer_identity_id_fkey"
            columns: ["freelancer_identity_id"]
            isOneToOne: false
            referencedRelation: "freelancer_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_submissions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "unified_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_submissions_submitted_by_user_id_fkey"
            columns: ["submitted_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
      library_poses: {
        Row: {
          clay_image_id: string
          created_at: string
          curation_status: string
          gender: string | null
          id: string
          library_id: string
          notes: string | null
          product_type: string | null
          shot_type: string | null
          slot: string
          updated_at: string
        }
        Insert: {
          clay_image_id: string
          created_at?: string
          curation_status?: string
          gender?: string | null
          id?: string
          library_id: string
          notes?: string | null
          product_type?: string | null
          shot_type?: string | null
          slot: string
          updated_at?: string
        }
        Update: {
          clay_image_id?: string
          created_at?: string
          curation_status?: string
          gender?: string | null
          id?: string
          library_id?: string
          notes?: string | null
          product_type?: string | null
          shot_type?: string | null
          slot?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_poses_clay_image_id_fkey"
            columns: ["clay_image_id"]
            isOneToOne: false
            referencedRelation: "clay_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_poses_library_id_fkey"
            columns: ["library_id"]
            isOneToOne: false
            referencedRelation: "brand_pose_libraries"
            referencedColumns: ["id"]
          },
        ]
      }
      look_source_images: {
        Row: {
          created_at: string | null
          digital_talent_id: string | null
          head_crop_height: number | null
          head_crop_width: number | null
          head_crop_x: number | null
          head_crop_y: number | null
          head_cropped_url: string | null
          id: string
          look_id: string
          source_url: string
          view: string
        }
        Insert: {
          created_at?: string | null
          digital_talent_id?: string | null
          head_crop_height?: number | null
          head_crop_width?: number | null
          head_crop_x?: number | null
          head_crop_y?: number | null
          head_cropped_url?: string | null
          id?: string
          look_id: string
          source_url: string
          view: string
        }
        Update: {
          created_at?: string | null
          digital_talent_id?: string | null
          head_crop_height?: number | null
          head_crop_width?: number | null
          head_crop_x?: number | null
          head_crop_y?: number | null
          head_cropped_url?: string | null
          id?: string
          look_id?: string
          source_url?: string
          view?: string
        }
        Relationships: []
      }
      look_view_states: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          completion_source: string | null
          created_at: string | null
          id: string
          look_id: string
          status: string
          tab: string
          updated_at: string | null
          view: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          completion_source?: string | null
          created_at?: string | null
          id?: string
          look_id: string
          status?: string
          tab: string
          updated_at?: string | null
          view: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          completion_source?: string | null
          created_at?: string | null
          id?: string
          look_id?: string
          status?: string
          tab?: string
          updated_at?: string | null
          view?: string
        }
        Relationships: [
          {
            foreignKeyName: "look_view_states_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "look_view_states_look_id_fkey"
            columns: ["look_id"]
            isOneToOne: false
            referencedRelation: "talent_looks"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          comment_id: string | null
          created_at: string
          id: string
          job_id: string | null
          metadata: Json | null
          read_at: string | null
          submission_id: string | null
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          metadata?: Json | null
          read_at?: string | null
          submission_id?: string | null
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          metadata?: Json | null
          read_at?: string | null
          submission_id?: string | null
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "review_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "unified_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "job_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
      pipeline_job_events: {
        Row: {
          id: string
          job_id: string
          level: string
          message: string
          metadata: Json | null
          timestamp: string
        }
        Insert: {
          id?: string
          job_id: string
          level?: string
          message: string
          metadata?: Json | null
          timestamp?: string
        }
        Update: {
          id?: string
          job_id?: string
          level?: string
          message?: string
          metadata?: Json | null
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_job_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "pipeline_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          origin_context: Json | null
          origin_route: string
          progress_done: number
          progress_failed: number
          progress_message: string | null
          progress_total: number
          source_job_id: string | null
          source_table: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["pipeline_job_status"]
          supports_pause: boolean | null
          supports_restart: boolean | null
          supports_retry: boolean | null
          title: string
          type: Database["public"]["Enums"]["pipeline_job_type"]
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          origin_context?: Json | null
          origin_route: string
          progress_done?: number
          progress_failed?: number
          progress_message?: string | null
          progress_total?: number
          source_job_id?: string | null
          source_table?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["pipeline_job_status"]
          supports_pause?: boolean | null
          supports_restart?: boolean | null
          supports_retry?: boolean | null
          title: string
          type: Database["public"]["Enums"]["pipeline_job_type"]
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          origin_context?: Json | null
          origin_route?: string
          progress_done?: number
          progress_failed?: number
          progress_message?: string | null
          progress_total?: number
          source_job_id?: string | null
          source_table?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["pipeline_job_status"]
          supports_pause?: boolean | null
          supports_restart?: boolean | null
          supports_retry?: boolean | null
          title?: string
          type?: Database["public"]["Enums"]["pipeline_job_type"]
          updated_at?: string
        }
        Relationships: []
      }
      product_images: {
        Row: {
          created_at: string
          id: string
          product_id: string
          shot_type: string | null
          slot: string
          source_url: string
          stored_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          shot_type?: string | null
          slot: string
          source_url: string
          stored_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          shot_type?: string | null
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
      production_projects: {
        Row: {
          brand_id: string | null
          created_at: string
          created_by_user_id: string | null
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_projects_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_projects_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
      project_looks: {
        Row: {
          created_at: string
          id: string
          look_name: string
          project_id: string
          selected_talent_id: string | null
          sku_code: string | null
          source_files_json: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          look_name: string
          project_id: string
          selected_talent_id?: string | null
          sku_code?: string | null
          source_files_json?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          look_name?: string
          project_id?: string
          selected_talent_id?: string | null
          sku_code?: string | null
          source_files_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "project_looks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "production_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_looks_selected_talent_id_fkey"
            columns: ["selected_talent_id"]
            isOneToOne: false
            referencedRelation: "digital_talents"
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
      repose_batch_items: {
        Row: {
          batch_id: string
          created_at: string | null
          id: string
          look_id: string | null
          source_output_id: string | null
          source_url: string
          view: string
        }
        Insert: {
          batch_id: string
          created_at?: string | null
          id?: string
          look_id?: string | null
          source_output_id?: string | null
          source_url: string
          view: string
        }
        Update: {
          batch_id?: string
          created_at?: string | null
          id?: string
          look_id?: string | null
          source_output_id?: string | null
          source_url?: string
          view?: string
        }
        Relationships: [
          {
            foreignKeyName: "repose_batch_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "repose_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repose_batch_items_source_output_id_fkey"
            columns: ["source_output_id"]
            isOneToOne: false
            referencedRelation: "job_outputs"
            referencedColumns: ["id"]
          },
        ]
      }
      repose_batches: {
        Row: {
          brand_id: string | null
          config_json: Json | null
          created_at: string | null
          id: string
          job_id: string | null
          project_id: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          brand_id?: string | null
          config_json?: Json | null
          created_at?: string | null
          id?: string
          job_id?: string | null
          project_id?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          brand_id?: string | null
          config_json?: Json | null
          created_at?: string | null
          id?: string
          job_id?: string | null
          project_id?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "repose_batches_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repose_batches_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "unified_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repose_batches_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "production_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      repose_outputs: {
        Row: {
          attempt_index: number | null
          batch_id: string
          batch_item_id: string
          created_at: string | null
          id: string
          pose_id: string | null
          pose_url: string | null
          result_url: string | null
          shot_type: string | null
          slot: string | null
          status: string
        }
        Insert: {
          attempt_index?: number | null
          batch_id: string
          batch_item_id: string
          created_at?: string | null
          id?: string
          pose_id?: string | null
          pose_url?: string | null
          result_url?: string | null
          shot_type?: string | null
          slot?: string | null
          status?: string
        }
        Update: {
          attempt_index?: number | null
          batch_id?: string
          batch_item_id?: string
          created_at?: string | null
          id?: string
          pose_id?: string | null
          pose_url?: string | null
          result_url?: string | null
          shot_type?: string | null
          slot?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "repose_outputs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "repose_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repose_outputs_batch_item_id_fkey"
            columns: ["batch_item_id"]
            isOneToOne: false
            referencedRelation: "repose_batch_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repose_outputs_pose_id_fkey"
            columns: ["pose_id"]
            isOneToOne: false
            referencedRelation: "clay_images"
            referencedColumns: ["id"]
          },
        ]
      }
      review_comments: {
        Row: {
          author_user_id: string | null
          body: string
          created_at: string
          freelancer_identity_id: string | null
          id: string
          read_by: Json | null
          thread_id: string
          visibility: Database["public"]["Enums"]["comment_visibility"]
        }
        Insert: {
          author_user_id?: string | null
          body: string
          created_at?: string
          freelancer_identity_id?: string | null
          id?: string
          read_by?: Json | null
          thread_id: string
          visibility?: Database["public"]["Enums"]["comment_visibility"]
        }
        Update: {
          author_user_id?: string | null
          body?: string
          created_at?: string
          freelancer_identity_id?: string | null
          id?: string
          read_by?: Json | null
          thread_id?: string
          visibility?: Database["public"]["Enums"]["comment_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "review_comments_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_comments_freelancer_identity_id_fkey"
            columns: ["freelancer_identity_id"]
            isOneToOne: false
            referencedRelation: "freelancer_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_comments_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "review_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      review_threads: {
        Row: {
          annotation_id: string | null
          asset_id: string | null
          created_at: string
          id: string
          scope: string
          submission_id: string
        }
        Insert: {
          annotation_id?: string | null
          asset_id?: string | null
          created_at?: string
          id?: string
          scope?: string
          submission_id: string
        }
        Update: {
          annotation_id?: string | null
          asset_id?: string | null
          created_at?: string
          id?: string
          scope?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_review_threads_annotation"
            columns: ["annotation_id"]
            isOneToOne: false
            referencedRelation: "image_annotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_threads_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "submission_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_threads_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "job_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_jobs: {
        Row: {
          brand_id: string
          created_at: string
          current_index: number | null
          id: string
          logs: Json | null
          product_urls: string[] | null
          progress: number | null
          status: string
          total: number | null
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          current_index?: number | null
          id?: string
          logs?: Json | null
          product_urls?: string[] | null
          progress?: number | null
          status?: string
          total?: number | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          current_index?: number | null
          id?: string
          logs?: Json | null
          product_urls?: string[] | null
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
      submission_assets: {
        Row: {
          created_at: string
          file_url: string | null
          freelancer_identity_id: string | null
          id: string
          job_output_id: string | null
          label: string | null
          review_status: string | null
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          revision_number: number | null
          sort_index: number
          submission_id: string
          superseded_by: string | null
        }
        Insert: {
          created_at?: string
          file_url?: string | null
          freelancer_identity_id?: string | null
          id?: string
          job_output_id?: string | null
          label?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          revision_number?: number | null
          sort_index?: number
          submission_id: string
          superseded_by?: string | null
        }
        Update: {
          created_at?: string
          file_url?: string | null
          freelancer_identity_id?: string | null
          id?: string
          job_output_id?: string | null
          label?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          revision_number?: number | null
          sort_index?: number
          submission_id?: string
          superseded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submission_assets_freelancer_identity_id_fkey"
            columns: ["freelancer_identity_id"]
            isOneToOne: false
            referencedRelation: "freelancer_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_assets_job_output_id_fkey"
            columns: ["job_output_id"]
            isOneToOne: false
            referencedRelation: "job_outputs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_assets_reviewed_by_user_id_fkey"
            columns: ["reviewed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_assets_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "job_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_assets_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "submission_assets"
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
          project_id: string | null
          signed_off_at: string | null
          signed_off_by: string | null
          talent_id: string
          workflow_status: string | null
        }
        Insert: {
          created_at?: string
          digital_talent_id?: string | null
          id?: string
          name: string
          product_type?: string | null
          project_id?: string | null
          signed_off_at?: string | null
          signed_off_by?: string | null
          talent_id: string
          workflow_status?: string | null
        }
        Update: {
          created_at?: string
          digital_talent_id?: string | null
          id?: string
          name?: string
          product_type?: string | null
          project_id?: string | null
          signed_off_at?: string | null
          signed_off_by?: string | null
          talent_id?: string
          workflow_status?: string | null
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
            foreignKeyName: "talent_looks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "face_application_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_looks_signed_off_by_fkey"
            columns: ["signed_off_by"]
            isOneToOne: false
            referencedRelation: "users"
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
      talent_pairing_templates: {
        Row: {
          created_at: string
          digital_talent_id: string
          digital_twin_id: string | null
          face_identity_id: string | null
          id: string
          last_used_at: string | null
          name: string
          scrape_run_id: string | null
          usage_count: number
        }
        Insert: {
          created_at?: string
          digital_talent_id: string
          digital_twin_id?: string | null
          face_identity_id?: string | null
          id?: string
          last_used_at?: string | null
          name: string
          scrape_run_id?: string | null
          usage_count?: number
        }
        Update: {
          created_at?: string
          digital_talent_id?: string
          digital_twin_id?: string | null
          face_identity_id?: string | null
          id?: string
          last_used_at?: string | null
          name?: string
          scrape_run_id?: string | null
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "talent_pairing_templates_digital_talent_id_fkey"
            columns: ["digital_talent_id"]
            isOneToOne: false
            referencedRelation: "digital_talents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_pairing_templates_digital_twin_id_fkey"
            columns: ["digital_twin_id"]
            isOneToOne: false
            referencedRelation: "digital_twins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_pairing_templates_face_identity_id_fkey"
            columns: ["face_identity_id"]
            isOneToOne: false
            referencedRelation: "face_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_pairing_templates_scrape_run_id_fkey"
            columns: ["scrape_run_id"]
            isOneToOne: false
            referencedRelation: "face_scrape_runs"
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
      unified_artifacts: {
        Row: {
          created_at: string | null
          file_url: string
          id: string
          look_id: string | null
          metadata: Json | null
          preview_url: string | null
          project_id: string | null
          source_id: string | null
          source_table: string | null
          type: Database["public"]["Enums"]["artifact_type"]
        }
        Insert: {
          created_at?: string | null
          file_url: string
          id?: string
          look_id?: string | null
          metadata?: Json | null
          preview_url?: string | null
          project_id?: string | null
          source_id?: string | null
          source_table?: string | null
          type: Database["public"]["Enums"]["artifact_type"]
        }
        Update: {
          created_at?: string | null
          file_url?: string
          id?: string
          look_id?: string | null
          metadata?: Json | null
          preview_url?: string | null
          project_id?: string | null
          source_id?: string | null
          source_table?: string | null
          type?: Database["public"]["Enums"]["artifact_type"]
        }
        Relationships: []
      }
      unified_jobs: {
        Row: {
          access_token: string | null
          assigned_user_id: string | null
          brief_snapshot: string | null
          created_at: string | null
          created_by: string | null
          due_date: string | null
          freelancer_identity_id: string | null
          id: string
          instructions: string | null
          job_group_id: string | null
          locked_at: string | null
          look_id: string | null
          priority: number | null
          project_id: string | null
          status: Database["public"]["Enums"]["job_status"] | null
          title: string | null
          type: Database["public"]["Enums"]["job_type"]
          updated_at: string | null
        }
        Insert: {
          access_token?: string | null
          assigned_user_id?: string | null
          brief_snapshot?: string | null
          created_at?: string | null
          created_by?: string | null
          due_date?: string | null
          freelancer_identity_id?: string | null
          id?: string
          instructions?: string | null
          job_group_id?: string | null
          locked_at?: string | null
          look_id?: string | null
          priority?: number | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["job_status"] | null
          title?: string | null
          type: Database["public"]["Enums"]["job_type"]
          updated_at?: string | null
        }
        Update: {
          access_token?: string | null
          assigned_user_id?: string | null
          brief_snapshot?: string | null
          created_at?: string | null
          created_by?: string | null
          due_date?: string | null
          freelancer_identity_id?: string | null
          id?: string
          instructions?: string | null
          job_group_id?: string | null
          locked_at?: string | null
          look_id?: string | null
          priority?: number | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["job_status"] | null
          title?: string | null
          type?: Database["public"]["Enums"]["job_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unified_jobs_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unified_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unified_jobs_freelancer_identity_id_fkey"
            columns: ["freelancer_identity_id"]
            isOneToOne: false
            referencedRelation: "freelancer_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unified_jobs_job_group_id_fkey"
            columns: ["job_group_id"]
            isOneToOne: false
            referencedRelation: "job_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          email: string
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email: string
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      initialize_library_from_clay_poses: {
        Args: { p_brand_id: string; p_library_id: string }
        Returns: number
      }
      is_internal_user: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      annotation_shape: "RECT"
      app_role: "admin" | "internal" | "freelancer" | "client"
      artifact_type:
        | "LOOK_SOURCE"
        | "LOOK_PREP"
        | "FACE_LIBRARY_REF"
        | "PHOTOSHOP_OUTPUT"
        | "REPOSE_VARIANT"
        | "CLIENT_SELECTION"
        | "RETOUCH_OUTPUT"
        | "HEAD_RENDER_FRONT"
        | "HEAD_RENDER_SIDE"
        | "HEAD_RENDER_BACK"
        | "LOOK_ORIGINAL"
        | "LOOK_ORIGINAL_FRONT"
        | "LOOK_ORIGINAL_SIDE"
        | "LOOK_ORIGINAL_BACK"
      comment_visibility: "SHARED" | "INTERNAL_ONLY"
      job_status:
        | "OPEN"
        | "ASSIGNED"
        | "IN_PROGRESS"
        | "SUBMITTED"
        | "NEEDS_CHANGES"
        | "APPROVED"
        | "CLOSED"
      job_type:
        | "PHOTOSHOP_FACE_APPLY"
        | "RETOUCH_FINAL"
        | "FOUNDATION_FACE_REPLACE"
      notification_type:
        | "JOB_SUBMITTED"
        | "COMMENT_MENTION"
        | "CHANGES_REQUESTED"
        | "JOB_APPROVED"
        | "COMMENT_REPLY"
      pipeline_job_status:
        | "QUEUED"
        | "RUNNING"
        | "PAUSED"
        | "COMPLETED"
        | "FAILED"
        | "CANCELED"
      pipeline_job_type:
        | "SCRAPE_BRAND"
        | "SCRAPE_FACES"
        | "CLAY_GENERATION"
        | "POSE_GENERATION"
        | "FACE_GENERATION"
        | "FACE_PAIRING"
        | "CROP_GENERATION"
        | "ORGANIZE_IMAGES"
        | "OTHER"
        | "REPOSE_GENERATION"
        | "ORGANIZE_FACES"
        | "CLASSIFY_FACES"
      submission_status:
        | "SUBMITTED"
        | "IN_REVIEW"
        | "CHANGES_REQUESTED"
        | "APPROVED"
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
    Enums: {
      annotation_shape: ["RECT"],
      app_role: ["admin", "internal", "freelancer", "client"],
      artifact_type: [
        "LOOK_SOURCE",
        "LOOK_PREP",
        "FACE_LIBRARY_REF",
        "PHOTOSHOP_OUTPUT",
        "REPOSE_VARIANT",
        "CLIENT_SELECTION",
        "RETOUCH_OUTPUT",
        "HEAD_RENDER_FRONT",
        "HEAD_RENDER_SIDE",
        "HEAD_RENDER_BACK",
        "LOOK_ORIGINAL",
        "LOOK_ORIGINAL_FRONT",
        "LOOK_ORIGINAL_SIDE",
        "LOOK_ORIGINAL_BACK",
      ],
      comment_visibility: ["SHARED", "INTERNAL_ONLY"],
      job_status: [
        "OPEN",
        "ASSIGNED",
        "IN_PROGRESS",
        "SUBMITTED",
        "NEEDS_CHANGES",
        "APPROVED",
        "CLOSED",
      ],
      job_type: [
        "PHOTOSHOP_FACE_APPLY",
        "RETOUCH_FINAL",
        "FOUNDATION_FACE_REPLACE",
      ],
      notification_type: [
        "JOB_SUBMITTED",
        "COMMENT_MENTION",
        "CHANGES_REQUESTED",
        "JOB_APPROVED",
        "COMMENT_REPLY",
      ],
      pipeline_job_status: [
        "QUEUED",
        "RUNNING",
        "PAUSED",
        "COMPLETED",
        "FAILED",
        "CANCELED",
      ],
      pipeline_job_type: [
        "SCRAPE_BRAND",
        "SCRAPE_FACES",
        "CLAY_GENERATION",
        "POSE_GENERATION",
        "FACE_GENERATION",
        "FACE_PAIRING",
        "CROP_GENERATION",
        "ORGANIZE_IMAGES",
        "OTHER",
        "REPOSE_GENERATION",
        "ORGANIZE_FACES",
        "CLASSIFY_FACES",
      ],
      submission_status: [
        "SUBMITTED",
        "IN_REVIEW",
        "CHANGES_REQUESTED",
        "APPROVED",
      ],
    },
  },
} as const
