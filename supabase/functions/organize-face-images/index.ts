import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

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

    // Get brand name from scrape run for title
    const { data: run } = await supabase
      .from('face_scrape_runs')
      .select('brand_name')
      .eq('id', scrapeRunId)
      .single();

    // Create a pipeline job to track progress
    const { data: job, error: jobError } = await supabase
      .from('pipeline_jobs')
      .insert({
        type: 'ORGANIZE_FACES',
        title: `Pre-filter: ${run?.brand_name || 'Unknown'}`,
        status: 'RUNNING',
        progress_total: 0,
        progress_done: 0,
        progress_failed: 0,
        progress_message: 'Starting pre-filter...',
        origin_route: '/face-creator',
        origin_context: { scrape_run_id: scrapeRunId },
        supports_pause: true,
        supports_retry: true,
        supports_restart: false,
        source_table: 'face_scrape_runs',
        source_job_id: scrapeRunId,
      })
      .select()
      .single();

    if (jobError) throw jobError;

    // Start background processing
    EdgeRuntime.waitUntil(processImages(job.id, scrapeRunId, supabase));

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

async function checkJobCanceled(supabase: any, jobId: string): Promise<boolean> {
  const { data: job } = await supabase
    .from('pipeline_jobs')
    .select('status')
    .eq('id', jobId)
    .single();
  return job?.status === 'CANCELED' || job?.status === 'PAUSED';
}

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
      .from('pipeline_jobs')
      .update({ 
        progress_total: images.length, 
        progress_done: 0,
        progress_message: `Analyzing ${images.length} images...`
      })
      .eq('id', jobId);

    const imagesToDelete: string[] = [];
    let processed = 0;
    let failed = 0;

    // Process in batches for better performance
    const BATCH_SIZE = 5;
    for (let i = 0; i < images.length; i += BATCH_SIZE) {
      // Check for cancellation
      if (await checkJobCanceled(supabase, jobId)) {
        console.log(`Job ${jobId} was canceled/paused, stopping`);
        break;
      }

      const batch = images.slice(i, i + BATCH_SIZE);
      
      const batchResults = await Promise.allSettled(
        batch.map(async (image: any) => {
          const classification = await classifyImage(image.source_url, lovableApiKey);
          console.log(`Image ${image.id}: ${JSON.stringify(classification)}`);
          return { image, classification };
        })
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          const { image, classification } = result.value;
          // Delete if it matches any exclusion criteria
          if (classification.isProductShot || 
              classification.isChild || 
              classification.isDetailCrop ||
              classification.isExtremeCloseup ||
              !classification.hasVisibleFace) {
            imagesToDelete.push(image.id);
            console.log(`Marking for deletion: ${classification.reason}`);
          }
        } else {
          console.error(`Batch item failed:`, result.reason);
          failed++;
        }
        processed++;
      }
        
      // Update progress after each batch
      await supabase
        .from('pipeline_jobs')
        .update({ 
          progress_done: processed,
          progress_failed: failed,
          progress_message: `Analyzed ${processed}/${images.length} images, ${imagesToDelete.length} to remove`
        })
        .eq('id', jobId);

      // Small delay between batches to avoid rate limits
      if (i + BATCH_SIZE < images.length) {
        await new Promise(r => setTimeout(r, 100));
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
      .from('pipeline_jobs')
      .update({ 
        status: 'COMPLETED',
        completed_at: new Date().toISOString(),
        progress_done: images.length,
        progress_failed: failed,
        progress_message: `Removed ${imagesToDelete.length} of ${images.length} images`
      })
      .eq('id', jobId);

    console.log(`Organization complete: removed ${imagesToDelete.length} of ${images.length} images`);
  } catch (error) {
    console.error('Organization job failed:', error);
    await supabase
      .from('pipeline_jobs')
      .update({ 
        status: 'FAILED',
        completed_at: new Date().toISOString(),
        progress_message: error instanceof Error ? error.message : 'Unknown error'
      })
      .eq('id', jobId);
  }
}

async function classifyImage(imageUrl: string, apiKey: string | undefined): Promise<{
  isProductShot: boolean;
  isChild: boolean;
  isDetailCrop: boolean;
  isExtremeCloseup: boolean;
  hasVisibleFace: boolean;
  reason: string;
}> {
  if (!apiKey) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  // Enhanced prompt to catch more junk images
  const prompt = `Analyze this fashion/e-commerce image and classify it:

1. Is this a product-only shot (flat lay, hanger, mannequin, no human)? YES/NO
2. Does this show a child (under 18)? YES/NO
3. Is this a cropped detail shot (shoes only, trouser legs only, belt/accessories only, hands with product)? YES/NO
4. Is an adult model's face visible from front, side, or 3/4 angle? YES/NO
5. Is this an extreme close-up (just fabric texture, buttons, stitching, or material detail)? YES/NO

Respond in this exact JSON format only:
{"isProductShot": true/false, "isChild": true/false, "isDetailCrop": true/false, "hasVisibleFace": true/false, "isExtremeCloseup": true/false, "reason": "brief explanation"}`;

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
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        isProductShot: parsed.isProductShot ?? false,
        isChild: parsed.isChild ?? false,
        isDetailCrop: parsed.isDetailCrop ?? false,
        isExtremeCloseup: parsed.isExtremeCloseup ?? false,
        hasVisibleFace: parsed.hasVisibleFace ?? true,
        reason: parsed.reason || 'Parsed successfully'
      };
    }
  } catch (e) {
    console.error('Failed to parse AI response:', content);
  }

  // Default to keeping the image if we can't parse
  return {
    isProductShot: false,
    isChild: false,
    isDetailCrop: false,
    isExtremeCloseup: false,
    hasVisibleFace: true,
    reason: 'Could not parse AI response'
  };
}
