export type JobType = 'PHOTOSHOP_FACE_APPLY' | 'RETOUCH_FINAL' | 'FOUNDATION_FACE_REPLACE';

export type JobStatus = 
  | 'OPEN'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'NEEDS_CHANGES'
  | 'APPROVED'
  | 'CLOSED';

export type ArtifactType =
  | 'LOOK_SOURCE'
  | 'LOOK_PREP'
  | 'FACE_LIBRARY_REF'
  | 'PHOTOSHOP_OUTPUT'
  | 'REPOSE_VARIANT'
  | 'CLIENT_SELECTION'
  | 'RETOUCH_OUTPUT'
  | 'HEAD_RENDER_FRONT'
  | 'HEAD_RENDER_SIDE'
  | 'HEAD_RENDER_BACK'
  | 'LOOK_ORIGINAL'
  | 'LOOK_ORIGINAL_FRONT'
  | 'LOOK_ORIGINAL_SIDE'
  | 'LOOK_ORIGINAL_BACK';

export interface UnifiedJob {
  id: string;
  project_id: string | null;
  look_id: string | null;
  type: JobType;
  status: JobStatus;
  assigned_user_id: string | null;
  due_date: string | null;
  instructions: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  assigned_user?: {
    id: string;
    display_name: string | null;
    email: string;
  };
  created_by_user?: {
    id: string;
    display_name: string | null;
    email: string;
  };
  project?: {
    id: string;
    name: string;
  };
  look?: {
    id: string;
    name: string;
  };
  inputs_count?: number;
  outputs_count?: number;
}

export interface UnifiedArtifact {
  id: string;
  project_id: string | null;
  look_id: string | null;
  type: ArtifactType;
  file_url: string;
  preview_url: string | null;
  source_table: string | null;
  source_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface JobInput {
  id: string;
  job_id: string;
  artifact_id: string | null;
  label: string | null;
  created_at: string;
  artifact?: UnifiedArtifact;
}

export interface JobOutput {
  id: string;
  job_id: string;
  artifact_id: string | null;
  file_url: string | null;
  label: string | null;
  uploaded_by: string | null;
  created_at: string;
  artifact?: UnifiedArtifact;
  uploader?: {
    id: string;
    display_name: string | null;
    email: string;
  };
}

export interface JobNote {
  id: string;
  job_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  author?: {
    id: string;
    display_name: string | null;
    email: string;
  };
}

export interface Invite {
  id: string;
  job_id: string | null;
  project_id: string | null;
  role: 'admin' | 'internal' | 'freelancer' | 'client';
  token: string;
  pin_code: string | null;
  email: string | null;
  expires_at: string;
  used_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface AuditEvent {
  id: string;
  user_id: string | null;
  project_id: string | null;
  job_id: string | null;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
  user?: {
    id: string;
    display_name: string | null;
    email: string;
  };
}
