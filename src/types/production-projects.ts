export type ProductionProjectStatus = 'ACTIVE' | 'COMPLETE' | 'ARCHIVED';

export interface ProductionProject {
  id: string;
  name: string;
  brand_id: string | null;
  created_by_user_id: string | null;
  status: ProductionProjectStatus;
  created_at: string;
  updated_at: string;
  // Joined/computed fields
  brand?: {
    id: string;
    name: string;
  };
  created_by?: {
    id: string;
    display_name: string | null;
    email: string;
  };
  // Stats
  looks_count?: number;
  jobs_count?: number;
  approved_looks_count?: number;
  open_jobs_count?: number;
  in_progress_jobs_count?: number;
  needs_changes_jobs_count?: number;
  approved_jobs_count?: number;
}

export interface ProjectLook {
  id: string;
  project_id: string;
  sku_code: string | null;
  look_name: string;
  source_files_json: {
    front?: string;
    back?: string;
    side?: string;
    detail?: string;
  };
  selected_talent_id: string | null;
  created_at: string;
  // Joined fields
  selected_talent?: {
    id: string;
    name: string;
    front_face_url: string | null;
  };
  // Computed from jobs
  job_status?: 'PENDING' | 'IN_PROGRESS' | 'APPROVED' | 'NEEDS_CHANGES';
  job_id?: string;
}

export interface ProjectWithStats extends ProductionProject {
  looks: ProjectLook[];
}
