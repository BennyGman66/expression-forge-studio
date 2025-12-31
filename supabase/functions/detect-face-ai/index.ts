import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const { imageUrl, aspectRatio = '1:1' } = await req.json();

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
            content: `You are an expert at analyzing fashion photography images. Your task is to:
1. Detect if there is a person's face visible in the image
2. If a face is visible, provide the precise bounding box coordinates as percentages (0-100) of the image dimensions
3. Suggest an optimal head-and-shoulders crop that:
   - Includes just the top of the hair (minimal space above, about 5-10% of face height)
   - Extends to the edge of the shoulders only (not into the chest area)
   - Is horizontally tight around the face and shoulders
4. Identify if the person's back is facing the camera (back view)

Return coordinates as percentages (0-100) where:
- x: left edge as percentage of image width
- y: top edge as percentage of image height  
- width: width as percentage of image width
- height: height as percentage of image height

For ${aspectRatio} aspect ratio crops, ensure the suggested crop maintains that ratio.`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this fashion photograph. Find the primary person's face and return the face bounding box and optimal head-and-shoulders crop coordinates. If this is a back-of-head shot, indicate that. Use the ${aspectRatio} aspect ratio for the suggested crop.`
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl }
              }
            ]
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
                    description: 'Whether a face was detected in the image'
                  },
                  faceBoundingBox: {
                    type: 'object',
                    description: 'The bounding box of the detected face as percentages (0-100). Null if no face detected.',
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
                    description: 'The suggested head-and-shoulders crop area as percentages (0-100)',
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
