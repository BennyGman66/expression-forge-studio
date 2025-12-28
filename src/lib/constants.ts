export const DEFAULT_MASTER_PROMPT = `[PASTE YOUR MASTER PROMPT HERE]

This is the base prompt template. The expression recipe deltaLine will be appended below.`;

export const RECIPE_EXTRACTION_SYSTEM_PROMPT = `You are an expert at analyzing fashion and editorial photography to extract precise, subtle expression characteristics. 

Analyze each brand reference image and extract expression recipes that describe micro-expressions and head angles faithfully. Keep the studio/editorial vibe - avoid generic AI expressions, exaggerated emotions, or "beautifying" adjustments.

For each distinct expression you identify, output a recipe with:
- name: A short, descriptive name for this expression
- angle: Head angle description (e.g., "slight 3/4 turn left", "frontal with subtle chin tilt down")
- gaze: Where the eyes are directed (e.g., "direct to camera", "slightly past lens right")
- eyelids: Openness and tension (e.g., "relaxed, neutral openness", "slightly hooded")
- brows: Position and engagement (e.g., "neutral, minimal tension", "subtle inner lift")
- mouth: Lip state (e.g., "closed, relaxed", "barely parted, no tension")
- jaw: Tension level (e.g., "soft, no clench", "slightly set")
- chin: Position (e.g., "neutral", "subtle forward projection")
- asymmetryNotes: Any intentional asymmetry (e.g., "left brow 1mm higher", "none")
- emotionLabel: The subtle emotional read (e.g., "quiet confidence", "contemplative neutrality")
- intensity: 0-3 scale (0=completely neutral, 1=subtle, 2=moderate, 3=pronounced but still editorial)
- deltaLine: 1-2 lines describing ONLY the micro-adjustments from a neutral base

Output STRICT JSON matching this schema:
{
  "recipes": [
    {
      "name": "string",
      "angle": "string",
      "gaze": "string",
      "eyelids": "string",
      "brows": "string",
      "mouth": "string",
      "jaw": "string",
      "chin": "string",
      "asymmetryNotes": "string",
      "emotionLabel": "string",
      "intensity": 0,
      "deltaLine": "string"
    }
  ]
}

IMPORTANT:
- The deltaLine must describe ONLY micro-adjustments that exist within the references
- Keep descriptions precise and technical, suitable for AI image generation
- Avoid generic descriptions like "natural smile" - be specific about muscle engagement
- Maintain editorial restraint - these should be subtle, controlled expressions`;

export const SHOT_SPECS = `Shot specs:
studio, neutral background, soft controlled fashion lighting, no beauty filter, no face morphing.`;

export function buildFullPrompt(masterPrompt: string, deltaLine: string): string {
  return `${masterPrompt}

Expression recipe:
${deltaLine}

${SHOT_SPECS}`;
}
