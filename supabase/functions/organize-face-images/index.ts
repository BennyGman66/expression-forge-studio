import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// URL patterns for pre-filtering (before AI classification)
const KIDS_URL_PATTERNS = [
  /\/kb0kb/i,      // Tommy boys
  /\/kg0kg/i,      // Tommy girls  
  /\/kn0kn/i,      // Tommy kids unisex
  /\/kids?\//i,    // /kids/ or /kid/ in URL
  /children/i,
  /\/junior/i,
  /\/youth/i,
  /\/boy[s]?\//i,
  /\/girl[s]?\//i,
];

const SHOE_URL_PATTERNS = [
  /espadrille/i,
  /sneaker/i,
  /trainer/i,
  /sandal/i,
  /slipper/i,
  /loafer/i,
  /boot[^h]/i,     // boot but not booth
  /\/fw0fw/i,      // Tommy footwear product codes
  /\/fm0fm/i,      // Tommy mens footwear
  /\/shoe[s]?\//i,
  /\/footwear\//i,
];

// Time limit for each worker invocation (60 seconds - Deno kills tasks around 70-90s)
const MAX_PROCESSING_TIME_MS = 60 * 1000;
const BATCH_SIZE = 3;

// Retry wrapper for transient API failures
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message.toLowerCase();
      const isTransient = msg.includes('502') || msg.includes('503') || 
                          msg.includes('429') || msg.includes('timeout') ||
                          msg.includes('rate limit');
      if (!isTransient || attempt === maxRetries - 1) throw lastError;
      const delay = baseDelayMs * Math.pow(2, attempt);
      console.log(`[withRetry] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { scrapeRunId, resumeJobId, resumeFromContext } = await req.json();

    if (!scrapeRunId) {
      return new Response(
        JSON.stringify({ error: 'scrapeRunId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let jobId = resumeJobId;

    if (resumeJobId) {
      // Resuming existing job - update status
      console.log(`[organize-face-images] Resuming existing job ${resumeJobId}`);
      await supabase
        .from('pipeline_jobs')
        .update({ 
          status: 'RUNNING', 
          progress_message: 'Resuming pre-filter...',
          updated_at: new Date().toISOString()
        })
        .eq('id', resumeJobId);
    } else {
      // Get brand name from scrape run for title
      const { data: run } = await supabase
        .from('face_scrape_runs')
        .select('brand_name')
        .eq('id', scrapeRunId)
        .single();

      // Create a new pipeline job to track progress
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
          origin_context: { scrape_run_id: scrapeRunId, processed_ids: [] },
          supports_pause: true,
          supports_retry: true,
          supports_restart: false,
          source_table: 'face_scrape_runs',
          source_job_id: scrapeRunId,
        })
        .select()
        .single();

      if (jobError) throw jobError;
      jobId = job.id;
    }

    // Get processed IDs from context (for resume)
    const processedIds = resumeFromContext?.processed_ids || [];
    const skipUrlPhase = resumeFromContext?.url_phase_done || false;
    const originalTotal = resumeFromContext?.original_total || 0;

    // Start background processing
    EdgeRuntime.waitUntil(processImages(jobId, scrapeRunId, supabase, processedIds, skipUrlPhase, originalTotal));

    return new Response(
      JSON.stringify({ success: true, jobId }),
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

async function processImages(
  jobId: string, 
  scrapeRunId: string, 
  supabase: any,
  alreadyProcessedIds: string[] = [],
  skipUrlPhase: boolean = false,
  originalTotal: number = 0
) {
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  const processedSet = new Set(alreadyProcessedIds);
  const startTime = Date.now();
  
  try {
    // Get all images for this scrape run
    const { data: allImages, error: imagesError } = await supabase
      .from('face_scrape_images')
      .select('id, source_url, product_url')
      .eq('scrape_run_id', scrapeRunId);

    if (imagesError) throw imagesError;

    // Use stored originalTotal if provided, otherwise set it from current count
    // This ensures consistent progress tracking even as images are deleted
    const totalToTrack = originalTotal > 0 ? originalTotal : (allImages.length + processedSet.size);

    // Filter out already processed images (for resume)
    const images = allImages.filter((img: any) => !processedSet.has(img.id));

    console.log(`[organize-face-images] Processing ${images.length} images (${processedSet.size} already done, totalToTrack=${totalToTrack}, skipUrlPhase=${skipUrlPhase})`);

    let urlFilteredIds: string[] = [];
    let remainingImages: any[] = images;

    // === PHASE 1: URL-based pre-filtering (skip if resuming) ===
    if (!skipUrlPhase) {
      remainingImages = [];
      
      for (const image of images) {
        const url = image.source_url || image.product_url || '';
        const isKids = KIDS_URL_PATTERNS.some(pattern => pattern.test(url));
        const isShoes = SHOE_URL_PATTERNS.some(pattern => pattern.test(url));
        
        if (isKids || isShoes) {
          urlFilteredIds.push(image.id);
          processedSet.add(image.id);
          console.log(`URL pre-filter: ${image.id} - ${isKids ? 'kids' : 'shoes'} product`);
        } else {
          remainingImages.push(image);
        }
      }

      console.log(`URL pre-filter: ${urlFilteredIds.length} images matched (kids/shoes)`);

      // Delete URL-matched images immediately
      if (urlFilteredIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('face_scrape_images')
          .delete()
          .in('id', urlFilteredIds);
        
        if (deleteError) {
          console.error('Error deleting URL-filtered images:', deleteError);
        }
      }

      // Update job with initial progress
      await supabase
        .from('pipeline_jobs')
        .update({ 
          progress_total: totalToTrack, 
          progress_done: processedSet.size,
          progress_message: `Removed ${urlFilteredIds.length} by URL, analyzing ${remainingImages.length} with AI...`,
          origin_context: { 
            scrape_run_id: scrapeRunId, 
            processed_ids: Array.from(processedSet),
            url_phase_done: true,
            original_total: totalToTrack
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);
    }

    // === PHASE 2: AI-based classification for remaining images ===
    const imagesToDelete: string[] = [];
    let failed = 0;

    for (let i = 0; i < remainingImages.length; i += BATCH_SIZE) {
      // Check if we're approaching timeout - auto-continue in new worker
      const elapsedMs = Date.now() - startTime;
      if (elapsedMs > MAX_PROCESSING_TIME_MS) {
        console.log(`Approaching timeout after ${elapsedMs}ms, scheduling continuation...`);
        
        // Delete images flagged so far before continuing
        if (imagesToDelete.length > 0) {
          await supabase
            .from('face_scrape_images')
            .delete()
            .in('id', imagesToDelete);
        }
        
        // Update status to show continuation
        await supabase
          .from('pipeline_jobs')
          .update({ 
            progress_message: `Continuing in new worker (${processedSet.size}/${totalToTrack})...`,
            origin_context: { 
              scrape_run_id: scrapeRunId, 
              processed_ids: Array.from(processedSet),
              url_phase_done: true,
              original_total: totalToTrack
            },
            updated_at: new Date().toISOString()
          })
          .eq('id', jobId);
        
        // Re-invoke ourselves to continue processing
        await supabase.functions.invoke('organize-face-images', {
          body: { 
            scrapeRunId, 
            resumeJobId: jobId,
            resumeFromContext: { 
              processed_ids: Array.from(processedSet),
              url_phase_done: true,
              original_total: totalToTrack
            }
          }
        });
        
        console.log(`Scheduled continuation, exiting current worker`);
        return; // Exit this worker, new one will continue
      }

      // Check for cancellation
      if (await checkJobCanceled(supabase, jobId)) {
        console.log(`Job ${jobId} was canceled/paused, stopping`);
        break;
      }

      const batch = remainingImages.slice(i, i + BATCH_SIZE);
      
      const batchResults = await Promise.allSettled(
        batch.map(async (image: any) => {
          const classification = await withRetry(() => 
            classifyImage(image.source_url, lovableApiKey)
          );
          console.log(`Image ${image.id}: ${JSON.stringify(classification)}`);
          return { image, classification };
        })
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          const { image, classification } = result.value;
          processedSet.add(image.id);
          
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
      }
        
      // Update progress after each batch (critical for resume capability)
      await supabase
        .from('pipeline_jobs')
        .update({ 
          progress_done: processedSet.size,
          progress_failed: failed,
          progress_message: `Analyzed ${processedSet.size}/${totalToTrack} images, ${urlFilteredIds.length + imagesToDelete.length} to remove`,
          origin_context: { 
            scrape_run_id: scrapeRunId, 
            processed_ids: Array.from(processedSet),
            url_phase_done: true,
            original_total: totalToTrack
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);

      // Small delay between batches to avoid rate limits
      if (i + BATCH_SIZE < remainingImages.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    // Delete flagged images
    if (imagesToDelete.length > 0) {
      console.log(`Deleting ${imagesToDelete.length} AI-flagged images`);
      
      const { error: deleteError } = await supabase
        .from('face_scrape_images')
        .delete()
        .in('id', imagesToDelete);

      if (deleteError) {
        console.error('Error deleting images:', deleteError);
      }
    }

    const totalDeleted = urlFilteredIds.length + imagesToDelete.length;

    // Mark job as completed
    await supabase
      .from('pipeline_jobs')
      .update({ 
        status: 'COMPLETED',
        completed_at: new Date().toISOString(),
        progress_done: totalToTrack,
        progress_failed: failed,
        progress_message: `Removed ${totalDeleted} of ${totalToTrack} images (${urlFilteredIds.length} by URL, ${imagesToDelete.length} by AI)`
      })
      .eq('id', jobId);

    console.log(`Organization complete: removed ${totalDeleted} of ${totalToTrack} images`);
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

  // Enhanced prompt to catch shoes, products, kids, and detail crops
  const prompt = `Analyze this fashion/e-commerce image carefully. Answer each question:

1. PRODUCT SHOT: Is this a product-only image with NO human model visible? This includes:
   - Flat lay clothing on a surface
   - Clothes on hangers or mannequins
   - Shoes photographed alone (not on a person's feet in a full outfit)
   - Bags, accessories without a person
   Answer: YES if no human body is visible

2. CHILD: Does this show a child or teenager (appears under 18 years old)?
   Look for: smaller stature, youthful face, children's clothing sizes

3. DETAIL CROP: Does this image show only a small portion of the body without a visible face?
   - Just feet/shoes on a person
   - Just lower legs/trousers
   - Just hands holding something
   - Just torso without head visible
   Answer: YES if the head/face is cropped out

4. FACE VISIBLE: Is an adult model's face visible from any angle (front, side, 3/4, or even partial)?
   Answer: YES if you can see facial features

5. EXTREME CLOSEUP: Is this just a fabric texture, buttons, stitching, label, or material detail?

IMPORTANT CLARIFICATIONS:
- Shoes photographed alone on white background = PRODUCT SHOT = YES
- Full-body shot where you can only see feet = DETAIL CROP = NO (head should be visible)
- Cropped shot showing only legs/feet = DETAIL CROP = YES

Respond in JSON only:
{"isProductShot": boolean, "isChild": boolean, "isDetailCrop": boolean, "hasVisibleFace": boolean, "isExtremeCloseup": boolean, "reason": "brief explanation"}`;

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
      throw new Error('Rate limit exceeded (429)');
    }
    if (response.status === 402) {
      throw new Error('Payment required');
    }
    if (response.status === 502 || response.status === 503) {
      throw new Error(`Server error (${response.status})`);
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
