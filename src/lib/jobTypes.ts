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
      { key: 'LOOK_ORIGINAL', label: 'Original Look Image', view: 'front' },
    ],
    defaultInstructions: `Replace the face on the original look using the supplied head renders (front/side/back). Keep clothing, body, crop, and background unchanged. Match lighting and realism.`,
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
