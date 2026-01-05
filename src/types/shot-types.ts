// ============================================================
// CANONICAL SHOT TYPES - Platform-wide source of truth
// ============================================================

// Input types (what we can upload per look)
export type InputViewType = 
  | 'INPUT_FRONT_FULL'
  | 'INPUT_BACK_FULL'
  | 'INPUT_DETAIL'
  | 'INPUT_SIDE';

// Output shot types (what we generate)
export type OutputShotType = 
  | 'FRONT_FULL'
  | 'FRONT_CROPPED'
  | 'DETAIL'
  | 'BACK_FULL';

// All output shot types for iteration
export const ALL_OUTPUT_SHOT_TYPES: OutputShotType[] = [
  'FRONT_FULL',
  'FRONT_CROPPED',
  'DETAIL',
  'BACK_FULL',
];

// Labels for UI display
export const OUTPUT_SHOT_LABELS: Record<OutputShotType, string> = {
  FRONT_FULL: 'Front (Full)',
  FRONT_CROPPED: 'Front (Cropped)',
  DETAIL: 'Detail',
  BACK_FULL: 'Back (Full)',
};

// Short labels for compact UI
export const OUTPUT_SHOT_SHORT_LABELS: Record<OutputShotType, string> = {
  FRONT_FULL: 'Front Full',
  FRONT_CROPPED: 'Front Crop',
  DETAIL: 'Detail',
  BACK_FULL: 'Back Full',
};

// Input view labels for UI display
export const INPUT_VIEW_LABELS: Record<InputViewType, string> = {
  INPUT_FRONT_FULL: 'Static Full Front',
  INPUT_BACK_FULL: 'Static Full Back',
  INPUT_DETAIL: 'Static Detail',
  INPUT_SIDE: 'Static Side',
};

// ============================================================
// LEGACY SLOT MAPPING (for backward compatibility)
// ============================================================

// Legacy slot type (to be phased out)
export type LegacySlot = 'A' | 'B' | 'C' | 'D';

// Mapping from legacy slot to new shot type
export const SLOT_TO_SHOT_TYPE: Record<LegacySlot, OutputShotType> = {
  'A': 'FRONT_FULL',
  'B': 'FRONT_CROPPED',
  'C': 'BACK_FULL',
  'D': 'DETAIL',
};

// Reverse mapping for database queries during transition
export const SHOT_TYPE_TO_SLOT: Record<OutputShotType, LegacySlot> = {
  'FRONT_FULL': 'A',
  'FRONT_CROPPED': 'B',
  'BACK_FULL': 'C',
  'DETAIL': 'D',
};

// Helper to convert legacy slot to shot type
export function slotToShotType(slot: string | null | undefined): OutputShotType | null {
  if (!slot) return null;
  return SLOT_TO_SHOT_TYPE[slot as LegacySlot] || null;
}

// Helper to convert shot type to legacy slot
export function shotTypeToSlot(shotType: OutputShotType): LegacySlot {
  return SHOT_TYPE_TO_SLOT[shotType];
}

// ============================================================
// CAMERA TO OUTPUT RULES (ENFORCED, NOT USER-CONFIGURABLE)
// ============================================================

// Which input views can produce which output shot types
export const INPUT_TO_OUTPUT_RULES: Record<InputViewType, OutputShotType[]> = {
  INPUT_FRONT_FULL: ['FRONT_FULL', 'FRONT_CROPPED', 'DETAIL'], // Detail fallback from front
  INPUT_BACK_FULL: ['BACK_FULL'], // Back ONLY from back input - NEVER from front
  INPUT_DETAIL: ['DETAIL'], // If available, takes priority for detail
  INPUT_SIDE: [], // Not required for deliverables, future expansion
};

// Which input is REQUIRED for each output (primary source)
export const OUTPUT_REQUIRED_INPUT: Record<OutputShotType, InputViewType> = {
  FRONT_FULL: 'INPUT_FRONT_FULL',
  FRONT_CROPPED: 'INPUT_FRONT_FULL',
  DETAIL: 'INPUT_FRONT_FULL', // Falls back to front if INPUT_DETAIL missing
  BACK_FULL: 'INPUT_BACK_FULL', // MUST come from back
};

// Whether an output can be derived from front if its preferred input is missing
export const CAN_DERIVE_FROM_FRONT: Record<OutputShotType, boolean> = {
  FRONT_FULL: true, // Uses front directly
  FRONT_CROPPED: true, // Derived from front
  DETAIL: true, // Can fall back to front crop
  BACK_FULL: false, // NEVER derive from front
};

// ============================================================
// CROP TARGET (for FRONT_CROPPED output)
// ============================================================

export type CropTarget = 'top' | 'trousers';

export const CROP_TARGET_LABELS: Record<CropTarget, string> = {
  top: 'Top',
  trousers: 'Trousers',
};

// ============================================================
// VIEW TYPE PARSING (from batch item labels)
// ============================================================

// Parse a view string (e.g., "Front View - filename") to InputViewType
export function parseViewToInputType(view: string): InputViewType | null {
  const lowerView = view.toLowerCase();
  
  if (lowerView.includes('front')) return 'INPUT_FRONT_FULL';
  if (lowerView.includes('back')) return 'INPUT_BACK_FULL';
  if (lowerView.includes('detail')) return 'INPUT_DETAIL';
  if (lowerView.includes('side')) return 'INPUT_SIDE';
  
  return null;
}

// Get the allowed output shot types for a given input view
export function getAllowedOutputsForInput(inputType: InputViewType): OutputShotType[] {
  return INPUT_TO_OUTPUT_RULES[inputType];
}

// Check if an output can be generated given available inputs
export function canGenerateOutput(
  outputType: OutputShotType,
  availableInputs: InputViewType[]
): { canGenerate: boolean; source: InputViewType | null; isDerived: boolean } {
  const requiredInput = OUTPUT_REQUIRED_INPUT[outputType];
  
  // Check if required input is available
  if (availableInputs.includes(requiredInput)) {
    return { canGenerate: true, source: requiredInput, isDerived: false };
  }
  
  // Check for DETAIL special case (can derive from front)
  if (outputType === 'DETAIL' && availableInputs.includes('INPUT_FRONT_FULL')) {
    return { canGenerate: true, source: 'INPUT_FRONT_FULL', isDerived: true };
  }
  
  return { canGenerate: false, source: null, isDerived: false };
}

// ============================================================
// OUTPUT PLAN CALCULATION
// ============================================================

export interface OutputPlanItem {
  shotType: OutputShotType;
  label: string;
  canGenerate: boolean;
  source: InputViewType | null;
  sourceLabel: string;
  isDerived: boolean;
  missingReason?: string;
}

export function calculateOutputPlan(availableInputs: InputViewType[]): OutputPlanItem[] {
  return ALL_OUTPUT_SHOT_TYPES.map((shotType) => {
    const { canGenerate, source, isDerived } = canGenerateOutput(shotType, availableInputs);
    
    let sourceLabel = '';
    let missingReason: string | undefined;
    
    if (source) {
      sourceLabel = isDerived 
        ? `derived from ${INPUT_VIEW_LABELS[source]}`
        : `from ${INPUT_VIEW_LABELS[source]}`;
    } else {
      const requiredInput = OUTPUT_REQUIRED_INPUT[shotType];
      missingReason = `Missing ${INPUT_VIEW_LABELS[requiredInput]}`;
    }
    
    return {
      shotType,
      label: OUTPUT_SHOT_LABELS[shotType],
      canGenerate,
      source,
      sourceLabel,
      isDerived,
      missingReason,
    };
  });
}
