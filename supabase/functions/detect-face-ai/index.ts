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
    const { imageUrl, aspectRatio = '1:1', referenceImages = [], baseUrl } = await req.json();

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
    
    // Check if reference images are from Supabase storage (publicly accessible)
    let useReferenceImages = false;
    if (referenceImages.length > 0) {
      const firstRef = referenceImages[0] as ReferenceImage;
      // Only use reference images if they're from Supabase storage (contain 'supabase' in URL)
      if (firstRef.original_image_url.includes('supabase')) {
        useReferenceImages = true;
        console.log(`[detect-face-ai] Using reference images from Supabase storage`);
      } else {
        console.log(`[detect-face-ai] Skipping reference images - not from Supabase storage`);
      }
    }

    // Build multi-image content for few-shot learning
    const userContent: any[] = [];
    
    if (useReferenceImages && referenceImages.length > 0) {
      userContent.push({
        type: 'text',
        text: `I will show you reference examples of EXACTLY how I want images cropped. Study these pairs carefully - the first image is the original, the second shows the CORRECT crop result with a green overlay indicating the crop area.`
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
          text: `Reference ${i + 1} - Original ${ref.view_type === 'back' ? 'BACK VIEW' : 'FRONT VIEW'} image (full body/source)`
        });
        userContent.push({
          type: 'image_url',
          image_url: { url: ref.cropped_image_url }
        });
        userContent.push({
          type: 'text',
          text: `Reference ${i + 1} - CORRECT crop result. The green rectangle shows the EXACT crop boundaries. Notice:
- Top edge: just above crown of head (2-5% padding above hair)
- Bottom edge: at shoulder line/collar level (NOT into chest)
- Side edges: at outer edges of shoulders (horizontally tight)
- Person nearly fills the entire frame`
        });
      }

      userContent.push({
        type: 'text',
        text: `Now analyze this NEW image and provide crop coordinates that EXACTLY match the style shown in the reference examples. Use the ${aspectRatio} aspect ratio.`
      });
    } else {
      userContent.push({
        type: 'text',
        text: `Analyze this fashion photograph. Find the primary person's face and return the face bounding box and optimal head-and-shoulders crop coordinates. If this is a back-of-head shot, indicate that. Use the ${aspectRatio} aspect ratio for the suggested crop.`
      });
    }

    // Add the target image to analyze
    userContent.push({
      type: 'image_url',
      image_url: { url: imageUrl }
    });

    // Enhanced system prompt with very specific crop rules
    const systemPrompt = `You are an expert fashion photo cropper. Your task is to analyze images and suggest TIGHT head-and-shoulders crops.

CRITICAL CROP RULES - Follow these EXACTLY:

FOR FRONT-FACING IMAGES:
1. TOP EDGE: Position just above the crown of the head. Maximum 3-5% of the crop height should be empty space above the hair.
2. BOTTOM EDGE: At the shoulder line where shoulders meet the neck/collar. Include the collar/neckline of clothing but DO NOT go below the shoulders into the chest area.
3. LEFT/RIGHT EDGES: At the outer edges of the shoulders with minimal padding (0-5%). The person should nearly fill the horizontal frame.
4. The head should occupy approximately 40-50% of the total crop height.
5. The crop should feel TIGHT - if in doubt, crop TIGHTER rather than looser.

FOR BACK-OF-HEAD IMAGES:
1. Same tight framing applies - center on the back of the head
2. TOP EDGE: Just above the crown of the head (2-5% padding)
3. BOTTOM EDGE: At the shoulder line (same as front view)
4. Mark isBackView as TRUE
5. Even though no face is visible, provide a crop that centers on where the head is

ASPECT RATIO ${aspectRatio}:
${aspectRatio === '1:1' 
  ? '- Square crop: Face centered, shoulders cropped to maintain square shape. May need to crop shoulders tighter to keep square.'
  : '- Portrait 4:5 crop: Slightly more vertical room. Can include a bit more of the shoulders while keeping the tight head framing.'}

Return ALL coordinates as percentages (0-100) of the ORIGINAL image dimensions:
- x: left edge as percentage of image width
- y: top edge as percentage of image height
- width: width as percentage of image width
- height: height as percentage of image height`;

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
