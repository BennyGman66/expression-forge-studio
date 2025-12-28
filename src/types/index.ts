export interface Project {
  id: string;
  name: string;
  master_prompt: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrandRef {
  id: string;
  project_id: string;
  image_url: string;
  file_name: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
}

export interface DigitalModel {
  id: string;
  project_id: string;
  name: string;
  created_at: string;
}

export interface DigitalModelRef {
  id: string;
  digital_model_id: string;
  image_url: string;
  file_name: string | null;
  created_at: string;
}

export interface RecipeJson {
  angle: string;
  gaze: string;
  eyelids: string;
  brows: string;
  mouth: string;
  jaw: string;
  chin: string;
  asymmetryNotes: string;
  emotionLabel: string;
  intensity: number;
}

export interface ExpressionRecipe {
  id: string;
  project_id: string;
  name: string;
  recipe_json: RecipeJson;
  delta_line: string | null;
  full_prompt_text: string | null;
  source_image_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  project_id: string;
  type: 'extraction' | 'generation';
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  total: number;
  logs: Array<{ timestamp: string; message: string; level: 'info' | 'error' | 'warn' }>;
  result: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Output {
  id: string;
  project_id: string;
  digital_model_id: string | null;
  recipe_id: string | null;
  image_url: string | null;
  prompt_used: string | null;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  metrics_json: Record<string, unknown>;
  created_at: string;
}

export interface GenerationPayload {
  digitalModelIds: string[];
  recipeIds: string[];
  variationsPerRecipe: number;
}
