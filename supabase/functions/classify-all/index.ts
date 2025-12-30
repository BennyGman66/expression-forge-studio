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
    const { runId } = await req.json();

    if (!runId) {
      return new Response(
        JSON.stringify({ error: 'Run ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Create a job record
    const { data: job, error: jobError } = await supabase
      .from('face_jobs')
      .insert({
        scrape_run_id: runId,
        type: 'classify_all',
        status: 'running',
      })
      .select()
      .single();

    if (jobError) throw jobError;

    // Start background processing
    const backgroundPromise = runClassificationPipeline(runId, job.id, supabase);
    (globalThis as any).EdgeRuntime?.waitUntil?.(backgroundPromise);

    return new Response(
      JSON.stringify({ success: true, jobId: job.id }),
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

async function runClassificationPipeline(runId: string, jobId: string, supabase: any) {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  
  try {
    // Get all images for this run
    const { data: images, error: imagesError } = await supabase
      .from('face_scrape_images')
      .select('*')
      .eq('scrape_run_id', runId);

    if (imagesError) throw imagesError;

    const total = images.length;
    console.log(`Starting classification pipeline for ${total} images`);

    // ===== STEP 1: Group images by product_url (create initial identities) =====
    await updateJob(supabase, jobId, 'product_grouping', 0, total);
    console.log('Step 1: Grouping images by product URL...');
    
    const initialModels = await createInitialIdentities(runId, images, supabase);
    console.log(`Created ${initialModels.length} initial models from product URLs`);

    // ===== STEP 2: Find front-facing image for each model =====
    await updateJob(supabase, jobId, 'finding_fronts', 0, initialModels.length);
    console.log('Step 2: Finding front-facing images for each model...');
    
    const modelsWithFronts = await findFrontFacingImages(initialModels, supabase, lovableKey);
    console.log(`Found front images for ${modelsWithFronts.filter(m => m.frontImageUrl).length} models`);

    // ===== STEP 3: Compare faces and merge duplicate models =====
    await updateJob(supabase, jobId, 'face_matching', 0, modelsWithFronts.length);
    console.log('Step 3: Comparing faces across models...');
    
    await compareFacesAndMerge(modelsWithFronts, supabase, lovableKey);

    // ===== STEP 4: Classify gender for each remaining model =====
    // Refresh the identities after merging
    const { data: remainingIdentities } = await supabase
      .from('face_identities')
      .select('*, face_identity_images(*, scrape_image:face_scrape_images(*))')
      .eq('scrape_run_id', runId);

    await updateJob(supabase, jobId, 'gender_classification', 0, remainingIdentities?.length || 0);
    console.log(`Step 4: Classifying gender for ${remainingIdentities?.length || 0} models...`);

    for (const identity of (remainingIdentities || [])) {
      // Use the first front-facing image or any image to classify gender
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
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // ===== STEP 5: Classify views for all identity images =====
    const { data: identityImages } = await supabase
      .from('face_identity_images')
      .select('*, scrape_image:face_scrape_images(*), identity:face_identities!inner(scrape_run_id)')
      .eq('identity.scrape_run_id', runId)
      .eq('is_ignored', false);

    await updateJob(supabase, jobId, 'view_classification', 0, identityImages?.length || 0);
    console.log(`Step 5: Classifying views for ${identityImages?.length || 0} images...`);

    let viewProgress = 0;
    for (const identityImage of (identityImages || [])) {
      // Skip if already classified in step 2
      if (identityImage.view !== 'unknown' && identityImage.view_source === 'ai') {
        viewProgress++;
        continue;
      }
      
      try {
        const imageUrl = identityImage.scrape_image?.source_url;
        if (imageUrl) {
          const view = await classifyView(imageUrl, lovableKey);
          await supabase
            .from('face_identity_images')
            .update({ view, view_source: 'ai' })
            .eq('id', identityImage.id);
          console.log(`View for image ${identityImage.id}: ${view}`);
        }
      } catch (err) {
        console.error('View classification error:', err);
      }
      
      viewProgress++;
      if (viewProgress % 5 === 0) {
        await updateJob(supabase, jobId, 'view_classification', viewProgress, identityImages?.length || 0);
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // ===== STEP 6: Renumber models sequentially =====
    await renumberModels(runId, supabase);

    // Mark job as completed
    await supabase
      .from('face_jobs')
      .update({ status: 'completed', progress: total, total })
      .eq('id', jobId);

    console.log('Classification pipeline completed for run:', runId);
  } catch (error) {
    console.error('Classification pipeline failed:', error);
    await supabase
      .from('face_jobs')
      .update({ status: 'failed' })
      .eq('id', jobId);
  }
}

async function updateJob(supabase: any, jobId: string, type: string, progress: number, total: number) {
  await supabase
    .from('face_jobs')
    .update({ type, progress, total })
    .eq('id', jobId);
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
    // Create identity with placeholder gender (will be classified later)
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

    // Link images to identity
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

// Step 2: Find the front-facing image for each model
async function findFrontFacingImages(
  models: Array<{ id: string; name: string; images: any[]; productUrl: string }>,
  supabase: any,
  lovableKey?: string
) {
  const results: Array<{ 
    id: string; 
    name: string; 
    images: any[]; 
    productUrl: string;
    frontImageUrl?: string;
    frontImageId?: string;
  }> = [];

  for (const model of models) {
    let frontImage = null;
    
    // Try to find the front-facing image
    for (const image of model.images) {
      const view = await classifyView(image.source_url, lovableKey);
      
      // Update the identity image with the view
      await supabase
        .from('face_identity_images')
        .update({ view, view_source: 'ai' })
        .eq('scrape_image_id', image.id)
        .eq('identity_id', model.id);
      
      if (view === 'front' && !frontImage) {
        frontImage = image;
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    results.push({
      ...model,
      frontImageUrl: frontImage?.source_url,
      frontImageId: frontImage?.id,
    });
  }

  return results;
}

// Step 3: Compare faces across models and merge duplicates
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
  lovableKey?: string
) {
  // Only compare models that have front-facing images
  const modelsWithFronts = models.filter(m => m.frontImageUrl);
  console.log(`Comparing ${modelsWithFronts.length} models with front-facing images`);

  // Track which models have been merged (by their ID)
  const mergedInto = new Map<string, string>(); // modelId -> targetModelId

  // Compare each pair of models
  for (let i = 0; i < modelsWithFronts.length; i++) {
    const modelA = modelsWithFronts[i];
    
    // Skip if this model was already merged into another
    if (mergedInto.has(modelA.id)) continue;

    for (let j = i + 1; j < modelsWithFronts.length; j++) {
      const modelB = modelsWithFronts[j];
      
      // Skip if this model was already merged into another
      if (mergedInto.has(modelB.id)) continue;

      // Compare the two faces
      const isSamePerson = await compareFaces(
        modelA.frontImageUrl!,
        modelB.frontImageUrl!,
        lovableKey
      );

      if (isSamePerson) {
        console.log(`MATCH: ${modelA.name} and ${modelB.name} are the same person - merging`);
        
        // Merge modelB into modelA
        await mergeModels(modelA.id, modelB.id, supabase);
        mergedInto.set(modelB.id, modelA.id);
      } else {
        console.log(`Different: ${modelA.name} and ${modelB.name}`);
      }

      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  console.log(`Merged ${mergedInto.size} duplicate models`);
}

// Compare two face images using AI
async function compareFaces(imageUrl1: string, imageUrl2: string, lovableKey?: string): Promise<boolean> {
  if (!lovableKey) {
    console.log('No LOVABLE_API_KEY found, skipping face comparison');
    return false;
  }

  try {
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
      return false;
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.toLowerCase().trim() || 'no';
    
    console.log(`Face comparison result: "${answer}"`);
    return answer.includes('yes');
  } catch (error) {
    console.error('Face comparison error:', error);
    return false;
  }
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

  try {
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
      return 'unknown';
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.toLowerCase().trim() || 'unknown';
    
    if (answer.includes('men') && !answer.includes('women')) return 'men';
    if (answer.includes('women') || answer.includes('woman')) return 'women';
    return 'unknown';
  } catch (error) {
    console.error('Gender classification error:', error);
    return 'unknown';
  }
}

async function classifyView(imageUrl: string, lovableKey?: string): Promise<string> {
  if (!lovableKey) {
    console.log('No LOVABLE_API_KEY found, skipping view classification');
    return 'unknown';
  }

  try {
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
      return 'unknown';
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.toLowerCase().trim() || 'unknown';
    
    if (answer.includes('front')) return 'front';
    if (answer.includes('side')) return 'side';
    if (answer.includes('back')) return 'back';
    return 'unknown';
  } catch (error) {
    console.error('View classification error:', error);
    return 'unknown';
  }
}
