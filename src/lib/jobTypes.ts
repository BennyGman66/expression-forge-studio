import { JobType, ArtifactType } from '@/types/jobs';

export interface JobInputConfig {
  key: ArtifactType;
  label: string;
  view?: string;
}

export interface JobTypeConfig {
  label: string;
  requiredInputs: JobInputConfig[];
  defaultInstructions: string;
  titleFormat: (lookName: string) => string;
}

export const JOB_TYPE_CONFIG: Record<JobType, JobTypeConfig> = {
  FOUNDATION_FACE_REPLACE: {
    label: "Foundation Face Replace",
    requiredInputs: [
      { key: 'HEAD_RENDER_FRONT', label: 'Head Render (Front)', view: 'front' },
      { key: 'HEAD_RENDER_SIDE', label: 'Head Render (Side)', view: 'side' },
      { key: 'HEAD_RENDER_BACK', label: 'Head Render (Back)', view: 'back' },
      { key: 'LOOK_ORIGINAL_FRONT', label: 'Original Look (Front)', view: 'front' },
      { key: 'LOOK_ORIGINAL_SIDE', label: 'Original Look (Side)', view: 'side' },
      { key: 'LOOK_ORIGINAL_BACK', label: 'Original Look (Back)', view: 'back' },
    ],
    defaultInstructions: `Replace the face on each original look view using the corresponding head render (front→front, side→side, back→back). Keep clothing, body, crop, and background unchanged. Match lighting and realism.`,
    titleFormat: (lookName: string) => `Foundation Face Replace — ${lookName}`,
  },
  PHOTOSHOP_FACE_APPLY: {
    label: "Photoshop Face Apply",
    requiredInputs: [],
    defaultInstructions: "",
    titleFormat: (lookName: string) => `Photoshop Face Apply — ${lookName}`,
  },
  RETOUCH_FINAL: {
    label: "Final Retouch",
    requiredInputs: [],
    defaultInstructions: "",
    titleFormat: (lookName: string) => `Final Retouch — ${lookName}`,
  },
};

export const getJobTypeLabel = (type: JobType): string => {
  return JOB_TYPE_CONFIG[type]?.label || type;
};

export const getJobTypeConfig = (type: JobType): JobTypeConfig | undefined => {
  return JOB_TYPE_CONFIG[type];
};
