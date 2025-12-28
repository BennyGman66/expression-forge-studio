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
      jobs: {
        Row: {
          created_at: string
          id: string
          logs: Json | null
          progress: number | null
          project_id: string
          result: Json | null
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
          project_id: string
          result?: Json | null
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
          project_id?: string
          result?: Json | null
          status?: string
          total?: number | null
          type?: string
          updated_at?: string
        }
        Relationships: [
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
