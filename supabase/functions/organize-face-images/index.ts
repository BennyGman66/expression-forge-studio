import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { scrapeRunId } = await req.json();

    if (!scrapeRunId) {
      return new Response(
        JSON.stringify({ error: 'scrapeRunId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Create a job to track progress
    const { data: job, error: jobError } = await supabase
      .from('face_jobs')
      .insert({
        scrape_run_id: scrapeRunId,
        type: 'organize',
        status: 'running',
        progress: 0,
        total: 0,
      })
      .select()
      .single();

    if (jobError) throw jobError;

    // Start background processing
    const backgroundPromise = processImages(job.id, scrapeRunId, supabase);
    (globalThis as any).EdgeRuntime?.waitUntil?.(backgroundPromise);

    return new Response(
      JSON.stringify({ success: true, jobId: job.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error starting organize job:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function processImages(jobId: string, scrapeRunId: string, supabase: any) {
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  
  try {
    // Get all images for this scrape run
    const { data: images, error: imagesError } = await supabase
      .from('face_scrape_images')
      .select('id, source_url')
      .eq('scrape_run_id', scrapeRunId);

    if (imagesError) throw imagesError;

    console.log(`Processing ${images.length} images for organization`);

    await supabase
      .from('face_jobs')
      .update({ total: images.length, progress: 0 })
      .eq('id', jobId);

    const imagesToDelete: string[] = [];
    let processed = 0;

    for (const image of images) {
      try {
        const classification = await classifyImage(image.source_url, lovableApiKey);
        
        console.log(`Image ${image.id}: ${JSON.stringify(classification)}`);

        // Delete if it's a product shot, child, or no visible face
        if (classification.isProductShot || classification.isChild || !classification.hasVisibleFace) {
          imagesToDelete.push(image.id);
          console.log(`Marking for deletion: ${classification.reason}`);
        }

        processed++;
        
        // Update progress every 5 images
        if (processed % 5 === 0 || processed === images.length) {
          await supabase
            .from('face_jobs')
            .update({ progress: processed })
            .eq('id', jobId);
        }
      } catch (err) {
        console.error(`Error classifying image ${image.id}:`, err);
        processed++;
      }
    }

    // Delete flagged images
    if (imagesToDelete.length > 0) {
      console.log(`Deleting ${imagesToDelete.length} images`);
      
      const { error: deleteError } = await supabase
        .from('face_scrape_images')
        .delete()
        .in('id', imagesToDelete);

      if (deleteError) {
        console.error('Error deleting images:', deleteError);
      }
    }

    // Mark job as completed
    await supabase
      .from('face_jobs')
      .update({ 
        status: 'completed', 
        progress: images.length,
        logs: [{
          timestamp: new Date().toISOString(),
          message: `Removed ${imagesToDelete.length} of ${images.length} images (product shots, children, or no visible face)`
        }]
      })
      .eq('id', jobId);

    console.log(`Organization complete: removed ${imagesToDelete.length} of ${images.length} images`);
  } catch (error) {
    console.error('Organization job failed:', error);
    await supabase
      .from('face_jobs')
      .update({ 
        status: 'failed',
        logs: [{
          timestamp: new Date().toISOString(),
          message: error instanceof Error ? error.message : 'Unknown error'
        }]
      })
      .eq('id', jobId);
  }
}

async function classifyImage(imageUrl: string, apiKey: string | undefined): Promise<{
  isProductShot: boolean;
  isChild: boolean;
  hasVisibleFace: boolean;
  reason: string;
}> {
  if (!apiKey) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  const prompt = `Analyze this fashion/e-commerce image and answer these questions:

1. Is this a product-only shot (clothing on hanger, flat lay, or no human model visible)? Answer YES or NO.
2. Does this image show a child (under 18 years old)? Answer YES or NO.
3. Does this image show an adult model's face clearly visible from the front, side (profile), or 3/4 angle? Answer YES or NO.

Respond in this exact JSON format only, no other text:
{\\"isProductShot\\": true/false, \\"isChild\\": true/false, \\"hasVisibleFace\\": true/false, \\"reason\\": \\"brief explanation\\"} `;

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }
      ],
      max_tokens: 200,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('AI API error:', response.status, text);
    
    if (response.status === 429) {
      throw new Error('Rate limit exceeded');
    }
    if (response.status === 402) {
      throw new Error('Payment required');
    }
    throw new Error(`AI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  
  // Parse JSON from response
  try {
    const jsonMatch = content.match(/\\{[\\s\\S]*\\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('Failed to parse AI response:', content);
  }

  // Default to keeping the image if we can't parse
  return {
    isProductShot: false,
    isChild: false,
    hasVisibleFace: true,
    reason: 'Could not parse AI response'
  };
}
