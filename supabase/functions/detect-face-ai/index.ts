import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReferenceImage {
  original_image_url: string;
  cropped_image_url: string;
  view_type: 'front' | 'back';
}

interface FaceDetectionResult {
  faceDetected: boolean;
  faceBoundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  suggestedCrop: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  isBackView: boolean;
  confidence: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl, aspectRatio = '1:1', referenceImages = [], baseUrl, corrections = [] } = await req.json();

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: 'imageUrl is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log(`[detect-face-ai] Processing image: ${imageUrl.substring(0, 100)}...`);
    console.log(`[detect-face-ai] Aspect ratio: ${aspectRatio}`);
    console.log(`[detect-face-ai] Reference images count: ${referenceImages.length}`);
    console.log(`[detect-face-ai] User corrections count: ${corrections.length}`);
    
    // Check if reference images are publicly accessible (have valid https URLs)
    let useReferenceImages = false;
    if (referenceImages.length > 0) {
      const firstRef = referenceImages[0] as ReferenceImage;
      // Use reference images if they have valid https URLs (publicly accessible)
      if (firstRef.original_image_url.startsWith('https://')) {
        useReferenceImages = true;
        console.log(`[detect-face-ai] Using reference images: ${firstRef.original_image_url.substring(0, 60)}...`);
      } else {
        console.log(`[detect-face-ai] Skipping reference images - not https URLs`);
      }
    }

    // Build multi-image content for few-shot learning
    const userContent: any[] = [];
    
    if (useReferenceImages && referenceImages.length > 0) {
      userContent.push({
        type: 'text',
        text: `I will show you reference examples of EXACTLY how I want images cropped. Study these pairs carefully.

CRITICAL: The crop size should be approximately 35-45% of the original image width and height. NEVER exceed 50%.`
      });

      // Add reference image pairs (limit to 3 to keep token count reasonable)
      const frontRefs = referenceImages.filter((r: ReferenceImage) => r.view_type === 'front').slice(0, 2);
      const backRefs = referenceImages.filter((r: ReferenceImage) => r.view_type === 'back').slice(0, 1);
      const selectedRefs = [...frontRefs, ...backRefs];

      for (let i = 0; i < selectedRefs.length; i++) {
        const ref = selectedRefs[i];
        console.log(`[detect-face-ai] Reference ${i + 1}: ${ref.original_image_url.substring(0, 80)}...`);

        userContent.push({
          type: 'image_url',
          image_url: { url: ref.original_image_url }
        });
        userContent.push({
          type: 'text',
          text: `Reference ${i + 1} - Original ${ref.view_type === 'back' ? 'BACK VIEW' : 'FRONT VIEW'} full-body image`
        });
        userContent.push({
          type: 'image_url',
          image_url: { url: ref.cropped_image_url }
        });
        userContent.push({
          type: 'text',
          text: `Reference ${i + 1} - CORRECT crop (35-45% of original). Key measurements:
- Crop WIDTH: ~40% of original image width (TIGHT around head)
- Crop HEIGHT: ~40% of original image height
- TOP: 2-3% gap above hair crown
- BOTTOM: at COLLAR/NECKLINE level - NOT shoulders, NOT chest
- SIDES: tight around head with 5% padding
The face fills MOST of the crop frame.`
        });
      }

      userContent.push({
        type: 'text',
        text: `Now analyze this NEW image. Provide crop coordinates that:
1. Are 35-45% of image dimensions (NEVER exceed 50%)
2. Cut off at the COLLAR LINE (where shirt meets neck), NOT at shoulders
3. Match the tight framing in the reference examples
Use ${aspectRatio} aspect ratio.`
      });
    } else {
      userContent.push({
        type: 'text',
        text: `Analyze this fashion photograph. Provide a TIGHT head crop (35-45% of image dimensions). Bottom edge at collar line, NOT shoulders.`
      });
    }

    // Add user corrections for dynamic learning (if any)
    if (corrections && corrections.length > 0) {
      userContent.push({
        type: 'text',
        text: `=== IMPORTANT: USER CORRECTIONS ===
The user has manually corrected previous AI crops. LEARN from these corrections and apply similar adjustments:
${corrections.map((c: any, i: number) => {
  const widthDelta = (c.user_crop.width - c.ai_crop.width).toFixed(1);
  const heightDelta = (c.user_crop.height - c.ai_crop.height).toFixed(1);
  const xDelta = (c.user_crop.x - c.ai_crop.x).toFixed(1);
  const yDelta = (c.user_crop.y - c.ai_crop.y).toFixed(1);
  return `Correction ${i + 1} (${c.view_type} view):
  - AI suggested: x=${c.ai_crop.x.toFixed(1)}, y=${c.ai_crop.y.toFixed(1)}, width=${c.ai_crop.width.toFixed(1)}%, height=${c.ai_crop.height.toFixed(1)}%
  - User corrected to: x=${c.user_crop.x.toFixed(1)}, y=${c.user_crop.y.toFixed(1)}, width=${c.user_crop.width.toFixed(1)}%, height=${c.user_crop.height.toFixed(1)}%
  - Delta: x${xDelta}, y${yDelta}, width${widthDelta}%, height${heightDelta}%`;
}).join('\n\n')}

APPLY THESE PATTERNS: If corrections consistently show the user wants SMALLER/TIGHTER crops, reduce your crop size. If they shift position, adjust accordingly.`
      });
    }

    // Add the target image to analyze
    userContent.push({
      type: 'image_url',
      image_url: { url: imageUrl }
    });

    // Enhanced system prompt with HARD SIZE CONSTRAINTS
    const systemPrompt = `You are an expert fashion photo cropper. Suggest TIGHT head-and-shoulders crops.

=== MANDATORY SIZE CONSTRAINTS ===
- Crop WIDTH: MUST be 30-50% of image width. NEVER exceed 50%.
- Crop HEIGHT: MUST be 30-50% of image height. NEVER exceed 50%.
- If your calculation exceeds 50%, REDUCE IT until it fits within 30-50%.
- Target: 38-45% for most images.

=== BOTTOM EDGE DEFINITION (CRITICAL) ===
The bottom edge is at the COLLAR LINE / NECKLINE:
- Where the shirt collar meets the base of the neck
- Just below the chin, at the top of the clothing
- NOT the full shoulders
- NOT the chest or torso
- Think "passport photo" framing

=== CROP RULES ===
FRONT-FACING:
- TOP: 2-5% padding above hair crown
- BOTTOM: At COLLAR LINE (NOT shoulders)
- SIDES: Tight around head (5-10% padding each side)
- The HEAD should fill 60-70% of the crop height

BACK-OF-HEAD:
- Same tight framing centered on back of head
- Mark isBackView as TRUE
- Bottom edge still at collar/neckline level

=== EXAMPLE OUTPUT ===
For a typical full-body front-facing image:
{ "x": 27, "y": 4, "width": 44, "height": 44 }

For a back view:
{ "x": 26, "y": 2, "width": 48, "height": 48 }

ASPECT RATIO: ${aspectRatio}
Return coordinates as percentages (0-100) of original image dimensions.`;

    // Call Gemini 2.5 Flash with tool calling for structured output
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userContent
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'report_face_detection',
              description: 'Report face detection results with bounding box and suggested crop coordinates',
              parameters: {
                type: 'object',
                properties: {
                  faceDetected: {
                    type: 'boolean',
                    description: 'Whether a face was detected in the image (true for front-facing, false for back view)'
                  },
                  faceBoundingBox: {
                    type: 'object',
                    description: 'The bounding box of the detected face as percentages (0-100). Null if no face detected or back view.',
                    properties: {
                      x: { type: 'number', description: 'Left edge as percentage of image width (0-100)' },
                      y: { type: 'number', description: 'Top edge as percentage of image height (0-100)' },
                      width: { type: 'number', description: 'Width as percentage of image width (0-100)' },
                      height: { type: 'number', description: 'Height as percentage of image height (0-100)' }
                    },
                    required: ['x', 'y', 'width', 'height']
                  },
                  suggestedCrop: {
                    type: 'object',
                    description: 'The suggested TIGHT head-and-shoulders crop area as percentages (0-100).',
                    properties: {
                      x: { type: 'number', description: 'Left edge as percentage of image width (0-100)' },
                      y: { type: 'number', description: 'Top edge as percentage of image height (0-100)' },
                      width: { type: 'number', description: 'Width as percentage of image width (0-100)' },
                      height: { type: 'number', description: 'Height as percentage of image height (0-100)' }
                    },
                    required: ['x', 'y', 'width', 'height']
                  },
                  isBackView: {
                    type: 'boolean',
                    description: 'Whether the person is facing away from the camera (back of head visible)'
                  },
                  confidence: {
                    type: 'number',
                    description: 'Confidence score from 0 to 1'
                  }
                },
                required: ['faceDetected', 'suggestedCrop', 'isBackView', 'confidence'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'report_face_detection' } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[detect-face-ai] AI API error: ${response.status}`, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limits exceeded, please try again later' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required, please add funds to your workspace' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`[detect-face-ai] Raw response:`, JSON.stringify(data).substring(0, 500));

    // Extract tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== 'report_face_detection') {
      console.error('[detect-face-ai] No valid tool call in response');
      throw new Error('No valid detection result from AI');
    }

    const result: FaceDetectionResult = JSON.parse(toolCall.function.arguments);
    console.log(`[detect-face-ai] Detection result:`, result);

    // Validate and clamp coordinates to 0-100 range
    const clamp = (val: number) => Math.max(0, Math.min(100, val));
    
    if (result.faceBoundingBox) {
      result.faceBoundingBox = {
        x: clamp(result.faceBoundingBox.x),
        y: clamp(result.faceBoundingBox.y),
        width: clamp(result.faceBoundingBox.width),
        height: clamp(result.faceBoundingBox.height),
      };
    }

    result.suggestedCrop = {
      x: clamp(result.suggestedCrop.x),
      y: clamp(result.suggestedCrop.y),
      width: clamp(result.suggestedCrop.width),
      height: clamp(result.suggestedCrop.height),
    };

    // Ensure crop doesn't extend beyond image bounds
    if (result.suggestedCrop.x + result.suggestedCrop.width > 100) {
      result.suggestedCrop.width = 100 - result.suggestedCrop.x;
    }
    if (result.suggestedCrop.y + result.suggestedCrop.height > 100) {
      result.suggestedCrop.height = 100 - result.suggestedCrop.y;
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[detect-face-ai] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
