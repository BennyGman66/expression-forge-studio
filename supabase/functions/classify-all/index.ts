import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Retry wrapper with exponential backoff for transient API errors
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      const isRetryable = 
        errorMessage.includes('502') ||
        errorMessage.includes('503') ||
        errorMessage.includes('429') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('ECONNRESET');
      
      if (!isRetryable || attempt === maxRetries - 1) {
        throw error;
      }
      
      const delay = baseDelayMs * Math.pow(2, attempt);
      console.log(`Retry ${attempt + 1}/${maxRetries} after ${delay}ms: ${errorMessage}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Max retries exceeded');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { runId, pipelineJobId, resumeFromStep } = await req.json();

    if (!runId) {
      return new Response(
        JSON.stringify({ error: 'Run ID is required' }),
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
      .eq('id', runId)
      .single();

    let jobId = pipelineJobId;
    
    // If resuming, reuse existing job; otherwise create new
    if (pipelineJobId) {
      // Update existing job to RUNNING
      await supabase
        .from('pipeline_jobs')
        .update({ 
          status: 'RUNNING',
          progress_message: `Resuming from step ${resumeFromStep || 1}...`,
          updated_at: new Date().toISOString()
        })
        .eq('id', pipelineJobId);
      console.log(`Resuming existing job ${pipelineJobId} from step ${resumeFromStep || 1}`);
    } else {
      // Create a new pipeline job to track progress
      const { data: job, error: jobError } = await supabase
        .from('pipeline_jobs')
        .insert({
          type: 'CLASSIFY_FACES',
          title: `Classify Models: ${run?.brand_name || 'Unknown'}`,
          status: 'RUNNING',
          progress_total: 6, // 6 steps
          progress_done: 0,
          progress_failed: 0,
          progress_message: 'Starting classification...',
          origin_route: '/face-creator',
          origin_context: { scrape_run_id: runId, current_step: 1 },
          supports_pause: true,
          supports_retry: true,
          supports_restart: true,
          source_table: 'face_scrape_runs',
          source_job_id: runId,
        })
        .select()
        .single();

      if (jobError) throw jobError;
      jobId = job.id;
    }

    // Start background processing
    EdgeRuntime.waitUntil(runClassificationPipeline(runId, jobId, supabase, resumeFromStep || 1));

    return new Response(
      JSON.stringify({ success: true, jobId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error starting classification:', error);
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

async function updateJobStep(supabase: any, jobId: string, step: number, message: string, context: Record<string, any> = {}) {
  const { data: job } = await supabase
    .from('pipeline_jobs')
    .select('origin_context')
    .eq('id', jobId)
    .single();

  await supabase
    .from('pipeline_jobs')
    .update({ 
      progress_done: step,
      progress_message: message,
      origin_context: { ...job?.origin_context, current_step: step, ...context },
      updated_at: new Date().toISOString()
    })
    .eq('id', jobId);
}

async function runClassificationPipeline(runId: string, jobId: string, supabase: any, resumeFromStep: number = 1) {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  
  try {
    // Get all images for this run
    const { data: images, error: imagesError } = await supabase
      .from('face_scrape_images')
      .select('*')
      .eq('scrape_run_id', runId);

    if (imagesError) throw imagesError;

    const total = images.length;
    console.log(`Starting classification pipeline for ${total} images (resuming from step ${resumeFromStep})`);

    let initialModels: Array<{ id: string; name: string; images: any[]; productUrl: string }> = [];

    // ===== STEP 1: Group images by product_url (create initial identities) =====
    if (resumeFromStep <= 1) {
      if (await checkJobCanceled(supabase, jobId)) return;
      await updateJobStep(supabase, jobId, 0, 'Step 1/6: Grouping by product...');
      console.log('Step 1: Grouping images by product URL...');
      
      initialModels = await createInitialIdentities(runId, images, supabase);
      console.log(`Created ${initialModels.length} initial models from product URLs`);
    } else {
      // Fetch existing identities for resume
      const { data: existingIdentities } = await supabase
        .from('face_identities')
        .select('*, face_identity_images(*, scrape_image:face_scrape_images(*))')
        .eq('scrape_run_id', runId);
      
      initialModels = (existingIdentities || []).map((identity: any) => ({
        id: identity.id,
        name: identity.name,
        images: identity.face_identity_images?.map((ii: any) => ii.scrape_image).filter(Boolean) || [],
        productUrl: identity.face_identity_images?.[0]?.scrape_image?.product_url || '',
      }));
      console.log(`Loaded ${initialModels.length} existing models for resume`);
    }

    // ===== STEP 2: Find front-facing image for each model =====
    let modelsWithFronts: Array<{ 
      id: string; name: string; images: any[]; productUrl: string;
      frontImageUrl?: string; frontImageId?: string;
    }> = [];
    
    if (resumeFromStep <= 2) {
      if (await checkJobCanceled(supabase, jobId)) return;
      await updateJobStep(supabase, jobId, 1, `Step 2/6: Finding fronts for ${initialModels.length} models...`);
      console.log('Step 2: Finding front-facing images for each model...');
      
      modelsWithFronts = await findFrontFacingImages(initialModels, supabase, lovableKey, jobId);
      console.log(`Found front images for ${modelsWithFronts.filter(m => m.frontImageUrl).length} models`);
    } else {
      // Build models with fronts from existing data for resume
      modelsWithFronts = initialModels.map(m => ({
        ...m,
        frontImageUrl: m.images.find((img: any) => img.source_url)?.source_url,
        frontImageId: m.images[0]?.id,
      }));
    }

    // ===== STEP 3: Compare faces and merge duplicate models =====
    if (resumeFromStep <= 3) {
      if (await checkJobCanceled(supabase, jobId)) return;
      await updateJobStep(supabase, jobId, 2, 'Step 3/6: Matching faces across models...');
      console.log('Step 3: Comparing faces across models...');
      
      await compareFacesAndMerge(modelsWithFronts, supabase, lovableKey, jobId);
    }

    // ===== STEP 4: Classify gender for each remaining model =====
    if (resumeFromStep <= 4) {
      if (await checkJobCanceled(supabase, jobId)) return;
      const { data: remainingIdentities } = await supabase
        .from('face_identities')
        .select('*, face_identity_images(*, scrape_image:face_scrape_images(*))')
        .eq('scrape_run_id', runId);

      await updateJobStep(supabase, jobId, 3, `Step 4/6: Classifying gender for ${remainingIdentities?.length || 0} models...`);
      console.log(`Step 4: Classifying gender for ${remainingIdentities?.length || 0} models...`);

      for (const identity of (remainingIdentities || [])) {
        if (await checkJobCanceled(supabase, jobId)) return;
        
        // Skip if already classified
        if (identity.gender !== 'unknown') continue;
        
        const representativeImage = identity.face_identity_images?.find((ii: any) => ii.view === 'front')?.scrape_image 
          || identity.face_identity_images?.[0]?.scrape_image;
        
        if (representativeImage?.source_url) {
          const gender = await classifyGender(representativeImage.source_url, lovableKey);
          await supabase
            .from('face_identities')
            .update({ gender })
            .eq('id', identity.id);
          console.log(`Model ${identity.name} classified as ${gender}`);
        }
      }
    }

    // ===== STEP 5: Classify views for all identity images (only unclassified ones) =====
    if (resumeFromStep <= 5) {
      if (await checkJobCanceled(supabase, jobId)) return;
      const { data: identityImages } = await supabase
        .from('face_identity_images')
        .select('*, scrape_image:face_scrape_images(*), identity:face_identities!inner(scrape_run_id)')
        .eq('identity.scrape_run_id', runId)
        .eq('is_ignored', false);

      // Only process images with unknown views (optimization: skip already classified in step 2)
      const unclassifiedImages = (identityImages || []).filter(
        (img: any) => img.view === 'unknown' || img.view_source !== 'ai'
      );

      await updateJobStep(supabase, jobId, 4, `Step 5/6: Classifying views for ${unclassifiedImages.length} images...`);
      console.log(`Step 5: Classifying views for ${unclassifiedImages.length} unclassified images...`);

      // Process in batches for better performance
      const BATCH_SIZE = 5;
      for (let i = 0; i < unclassifiedImages.length; i += BATCH_SIZE) {
        if (await checkJobCanceled(supabase, jobId)) return;

        const batch = unclassifiedImages.slice(i, i + BATCH_SIZE);
        
        await Promise.all(
          batch.map(async (identityImage: any) => {
            try {
              const imageUrl = identityImage.scrape_image?.source_url;
              if (imageUrl) {
                const view = await classifyView(imageUrl, lovableKey);
                await supabase
                  .from('face_identity_images')
                  .update({ view, view_source: 'ai' })
                  .eq('id', identityImage.id);
              }
            } catch (err) {
              console.error('View classification error:', err);
            }
          })
        );

        // Small delay between batches
        if (i + BATCH_SIZE < unclassifiedImages.length) {
          await new Promise(r => setTimeout(r, 100));
        }
      }
    }

    // ===== STEP 6: Renumber models sequentially =====
    if (await checkJobCanceled(supabase, jobId)) return;
    await updateJobStep(supabase, jobId, 5, 'Step 6/6: Finalizing model names...');
    await renumberModels(runId, supabase);

    // Get final count for completion message
    const { count: finalModelCount } = await supabase
      .from('face_identities')
      .select('*', { count: 'exact', head: true })
      .eq('scrape_run_id', runId);

    // Mark job as completed
    await supabase
      .from('pipeline_jobs')
      .update({ 
        status: 'COMPLETED',
        completed_at: new Date().toISOString(),
        progress_done: 6,
        progress_message: `Classified ${finalModelCount || 0} models`
      })
      .eq('id', jobId);

    console.log('Classification pipeline completed for run:', runId);
  } catch (error) {
    console.error('Classification pipeline failed:', error);
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

// Step 1: Group all images by product_url and create identities
async function createInitialIdentities(runId: string, images: any[], supabase: any) {
  // Clear any existing identities for this run
  const { data: existingIdentities } = await supabase
    .from('face_identities')
    .select('id')
    .eq('scrape_run_id', runId);
  
  if (existingIdentities?.length) {
    for (const identity of existingIdentities) {
      await supabase.from('face_identity_images').delete().eq('identity_id', identity.id);
    }
    await supabase.from('face_identities').delete().eq('scrape_run_id', runId);
  }

  // Group images by product URL
  const productGroups = new Map<string, any[]>();
  for (const image of images) {
    const key = image.product_url || `unknown_${image.id}`;
    if (!productGroups.has(key)) {
      productGroups.set(key, []);
    }
    productGroups.get(key)!.push(image);
  }

  const models: Array<{ id: string; name: string; images: any[]; productUrl: string }> = [];
  let modelIndex = 1;

  for (const [productUrl, groupImages] of productGroups) {
    const { data: identity, error: identityError } = await supabase
      .from('face_identities')
      .insert({
        scrape_run_id: runId,
        name: `Model ${String(modelIndex).padStart(2, '0')}`,
        gender: 'unknown',
        image_count: groupImages.length,
        representative_image_id: groupImages[0].id,
      })
      .select()
      .single();

    if (identityError) {
      console.error('Error creating identity:', identityError);
      continue;
    }

    for (const image of groupImages) {
      await supabase
        .from('face_identity_images')
        .insert({
          identity_id: identity.id,
          scrape_image_id: image.id,
          view: 'unknown',
          view_source: 'pending',
        });
    }

    models.push({
      id: identity.id,
      name: identity.name,
      images: groupImages,
      productUrl,
    });

    modelIndex++;
  }

  return models;
}

// Step 2: Find the front-facing image for each model (PARALLEL batched processing)
async function findFrontFacingImages(
  models: Array<{ id: string; name: string; images: any[]; productUrl: string }>,
  supabase: any,
  lovableKey?: string,
  jobId?: string
) {
  const MODEL_BATCH_SIZE = 5; // Process 5 models in parallel (reduced for stability)
  const results: Array<{ 
    id: string; 
    name: string; 
    images: any[]; 
    productUrl: string;
    frontImageUrl?: string;
    frontImageId?: string;
  }> = [];

  // Process a single model - find its front image
  const processModel = async (model: typeof models[0]): Promise<typeof results[0]> => {
    // Only check the first image for front detection - early exit optimization
    const firstImage = model.images[0];
    if (!firstImage) {
      return { ...model, frontImageUrl: undefined, frontImageId: undefined };
    }

    // Check first image
    const firstView = await classifyView(firstImage.source_url, lovableKey);
    await supabase
      .from('face_identity_images')
      .update({ view: firstView, view_source: 'ai' })
      .eq('scrape_image_id', firstImage.id)
      .eq('identity_id', model.id);

    if (firstView === 'front') {
      return {
        ...model,
        frontImageUrl: firstImage.source_url,
        frontImageId: firstImage.id,
      };
    }

    // Check remaining images if first wasn't front (batch of 2)
    for (let i = 1; i < model.images.length; i += 2) {
      const batch = model.images.slice(i, Math.min(i + 2, model.images.length));
      
      const viewResults = await Promise.all(
        batch.map(async (image: any) => {
          const view = await classifyView(image.source_url, lovableKey);
          await supabase
            .from('face_identity_images')
            .update({ view, view_source: 'ai' })
            .eq('scrape_image_id', image.id)
            .eq('identity_id', model.id);
          return { image, view };
        })
      );

      const front = viewResults.find(r => r.view === 'front');
      if (front) {
        return {
          ...model,
          frontImageUrl: front.image.source_url,
          frontImageId: front.image.id,
        };
      }
    }

    // No front found - use first as fallback
    console.log(`No front found for ${model.name}, using first image as fallback`);
    return {
      ...model,
      frontImageUrl: firstImage.source_url,
      frontImageId: firstImage.id,
    };
  };

  // Process models in parallel batches
  for (let i = 0; i < models.length; i += MODEL_BATCH_SIZE) {
    const batch = models.slice(i, i + MODEL_BATCH_SIZE);
    
    const batchResults = await Promise.all(batch.map(processModel));
    results.push(...batchResults);

    // Update progress after each batch
    if (jobId) {
      const percent = Math.round((results.length / models.length) * 100);
      await supabase
        .from('pipeline_jobs')
        .update({ 
          progress_message: `Step 2/6: Finding fronts... ${results.length}/${models.length} (${percent}%)`,
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);
    }

    console.log(`Step 2 progress: ${results.length}/${models.length} models processed`);
    
    // Small breathing room between batches to prevent timeout
    await new Promise(r => setTimeout(r, 50));
  }

  return results;
}

// Step 3: Compare faces across models and merge duplicates (with Union-Find optimization)
async function compareFacesAndMerge(
  models: Array<{ 
    id: string; 
    name: string; 
    images: any[]; 
    productUrl: string;
    frontImageUrl?: string;
    frontImageId?: string;
  }>,
  supabase: any,
  lovableKey?: string,
  jobId?: string
) {
  // Only compare models that have front-facing images
  const modelsWithFronts = models.filter(m => m.frontImageUrl);
  console.log(`Comparing ${modelsWithFronts.length} models with front-facing images`);

  // Sort by image count - compare larger groups first (Union-Find optimization)
  modelsWithFronts.sort((a, b) => b.images.length - a.images.length);

  // Union-Find data structure for efficient merging
  const parent = new Map<string, string>();
  const getRoot = (id: string): string => {
    if (!parent.has(id)) parent.set(id, id);
    if (parent.get(id) !== id) {
      parent.set(id, getRoot(parent.get(id)!));
    }
    return parent.get(id)!;
  };
  const union = (a: string, b: string) => {
    const rootA = getRoot(a);
    const rootB = getRoot(b);
    if (rootA !== rootB) {
      parent.set(rootB, rootA);
    }
  };

  // Compare each pair of models
  for (let i = 0; i < modelsWithFronts.length; i++) {
    const modelA = modelsWithFronts[i];
    
    // Skip if already merged into another
    if (getRoot(modelA.id) !== modelA.id) continue;

    for (let j = i + 1; j < modelsWithFronts.length; j++) {
      const modelB = modelsWithFronts[j];
      
      // Skip if already merged
      if (getRoot(modelB.id) !== modelB.id) continue;

      const isSamePerson = await compareFaces(
        modelA.frontImageUrl!,
        modelB.frontImageUrl!,
        lovableKey
      );

      if (isSamePerson) {
        console.log(`MATCH: ${modelA.name} and ${modelB.name} are the same person`);
        union(modelA.id, modelB.id);
      }

      // Small delay between comparisons
      await new Promise(r => setTimeout(r, 100));
    }
  }

  // Batch merge using Union-Find results
  const mergeGroups = new Map<string, string[]>();
  for (const model of modelsWithFronts) {
    const root = getRoot(model.id);
    if (!mergeGroups.has(root)) {
      mergeGroups.set(root, []);
    }
    if (model.id !== root) {
      mergeGroups.get(root)!.push(model.id);
    }
  }

  let mergeCount = 0;
  for (const [targetId, sourceIds] of mergeGroups) {
    for (const sourceId of sourceIds) {
      await mergeModels(targetId, sourceId, supabase);
      mergeCount++;
    }
  }

  console.log(`Merged ${mergeCount} duplicate models`);
}

// Compare two face images using AI
async function compareFaces(imageUrl1: string, imageUrl2: string, lovableKey?: string): Promise<boolean> {
  if (!lovableKey) {
    console.log('No LOVABLE_API_KEY found, skipping face comparison');
    return false;
  }

  // Use retry wrapper for transient errors
  return withRetry(async () => {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Look at these two photos of fashion models. Are they the same person? 
Focus on facial features like face shape, eyes, nose, mouth, and overall appearance.
Ignore clothing, background, pose, and lighting differences.
Reply with just "yes" if they are definitely the same person, or "no" if they are different people or if you are unsure.`,
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl1 },
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl2 },
              },
            ],
          },
        ],
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Face comparison API error:', response.status, errorText.substring(0, 200));
      
      // Throw for retryable errors
      if (response.status === 502 || response.status === 503 || response.status === 429) {
        throw new Error(`${response.status} - Retryable API error`);
      }
      return false;
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.toLowerCase().trim() || 'no';
    
    console.log(`Face comparison result: "${answer}"`);
    return answer.includes('yes');
  }, 3, 1000).catch((err) => {
    console.error('Face comparison failed after retries:', err);
    return false;
  });
}

// Merge two models: move all images from sourceId to targetId, then delete source
async function mergeModels(targetId: string, sourceId: string, supabase: any) {
  // Move all identity images from source to target
  await supabase
    .from('face_identity_images')
    .update({ identity_id: targetId })
    .eq('identity_id', sourceId);

  // Update the target's image count
  const { count } = await supabase
    .from('face_identity_images')
    .select('*', { count: 'exact', head: true })
    .eq('identity_id', targetId);

  await supabase
    .from('face_identities')
    .update({ image_count: count || 0 })
    .eq('id', targetId);

  // Delete the source identity
  await supabase
    .from('face_identities')
    .delete()
    .eq('id', sourceId);
}

// Renumber models sequentially after merging
async function renumberModels(runId: string, supabase: any) {
  const { data: identities } = await supabase
    .from('face_identities')
    .select('id, created_at')
    .eq('scrape_run_id', runId)
    .order('created_at', { ascending: true });

  if (!identities) return;

  for (let i = 0; i < identities.length; i++) {
    await supabase
      .from('face_identities')
      .update({ name: `Model ${String(i + 1).padStart(2, '0')}` })
      .eq('id', identities[i].id);
  }
}

async function classifyGender(imageUrl: string, lovableKey?: string): Promise<string> {
  if (!lovableKey) {
    console.log('No LOVABLE_API_KEY found, skipping gender classification');
    return 'unknown';
  }

  // Use retry wrapper for transient errors
  return withRetry(async () => {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Look at this fashion/clothing image. Is the model wearing the clothes a man or woman? Reply with just one word: "men" or "women". If you cannot determine, reply "unknown".',
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gender classification API error:', response.status, errorText.substring(0, 200));
      
      // Throw for retryable errors
      if (response.status === 502 || response.status === 503 || response.status === 429) {
        throw new Error(`${response.status} - Retryable API error`);
      }
      return 'unknown';
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.toLowerCase().trim() || 'unknown';
    
    if (answer.includes('men') && !answer.includes('women')) return 'men';
    if (answer.includes('women') || answer.includes('woman')) return 'women';
    return 'unknown';
  }, 3, 1000).catch((err) => {
    console.error('Gender classification failed after retries:', err);
    return 'unknown';
  });
}

async function classifyView(imageUrl: string, lovableKey?: string): Promise<string> {
  if (!lovableKey) {
    console.log('No LOVABLE_API_KEY found, skipping view classification');
    return 'unknown';
  }

  // Use retry wrapper for transient errors
  return withRetry(async () => {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Look at this fashion model image. From what angle is the model photographed? Reply with just one word: "front" (facing camera), "side" (profile view), or "back" (back to camera). If unclear, reply "unknown".',
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('View classification API error:', response.status, errorText.substring(0, 200));
      
      // Throw for retryable errors
      if (response.status === 502 || response.status === 503 || response.status === 429) {
        throw new Error(`${response.status} - Retryable API error`);
      }
      return 'unknown';
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.toLowerCase().trim() || 'unknown';
    
    if (answer.includes('front')) return 'front';
    if (answer.includes('side')) return 'side';
    if (answer.includes('back')) return 'back';
    return 'unknown';
  }, 3, 1000).catch((err) => {
    console.error('View classification failed after retries:', err);
    return 'unknown';
  });
}
