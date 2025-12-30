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
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  
  try {
    // Get all images for this run
    const { data: images, error: imagesError } = await supabase
      .from('face_scrape_images')
      .select('*')
      .eq('scrape_run_id', runId);

    if (imagesError) throw imagesError;

    const total = images.length;
    let progress = 0;

    // Update job with total
    await updateJob(supabase, jobId, 'gender_classification', 0, total);

    // Step 1: Gender Classification (for images without gender)
    const unknownGenderImages = images.filter((img: any) => img.gender === 'unknown' || !img.gender);
    
    for (const image of unknownGenderImages) {
      try {
        const gender = await classifyGender(image.source_url, lovableKey, openaiKey);
        await supabase
          .from('face_scrape_images')
          .update({ gender, gender_source: 'ai' })
          .eq('id', image.id);
        
        image.gender = gender;
      } catch (err) {
        console.error('Gender classification error:', err);
      }
      
      progress++;
      if (progress % 5 === 0) {
        await updateJob(supabase, jobId, 'gender_classification', progress, total);
      }
    }

    // Step 2: Identity Clustering (group by similar faces)
    await updateJob(supabase, jobId, 'identity_clustering', 0, total);
    
    // Group images by gender first
    const menImages = images.filter((img: any) => img.gender === 'men');
    const womenImages = images.filter((img: any) => img.gender === 'women');

    // Create identity clusters for each gender
    await createIdentityClusters(runId, 'men', menImages, supabase, lovableKey, openaiKey);
    await createIdentityClusters(runId, 'women', womenImages, supabase, lovableKey, openaiKey);

    // Step 3: View Classification
    await updateJob(supabase, jobId, 'view_classification', 0, total);
    
    const { data: identityImages } = await supabase
      .from('face_identity_images')
      .select('*, scrape_image:face_scrape_images(*)')
      .eq('is_ignored', false);

    progress = 0;
    for (const identityImage of (identityImages || [])) {
      try {
        const imageUrl = identityImage.scrape_image?.source_url;
        if (imageUrl) {
          const view = await classifyView(imageUrl, lovableKey, openaiKey);
          await supabase
            .from('face_identity_images')
            .update({ view, view_source: 'ai' })
            .eq('id', identityImage.id);
        }
      } catch (err) {
        console.error('View classification error:', err);
      }
      
      progress++;
      if (progress % 5 === 0) {
        await updateJob(supabase, jobId, 'view_classification', progress, identityImages?.length || 0);
      }
    }

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

async function classifyGender(imageUrl: string, lovableKey?: string, openaiKey?: string): Promise<string> {
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

async function classifyView(imageUrl: string, lovableKey?: string, openaiKey?: string): Promise<string> {
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

async function createIdentityClusters(
  runId: string, 
  gender: string, 
  images: any[], 
  supabase: any,
  lovableKey?: string,
  openaiKey?: string
) {
  if (images.length === 0) return;

  // For now, use a simple approach: group by product URL
  // In a production system, you'd use face embeddings for proper clustering
  const productGroups = new Map<string, any[]>();
  
  for (const image of images) {
    const key = image.product_url || 'unknown';
    if (!productGroups.has(key)) {
      productGroups.set(key, []);
    }
    productGroups.get(key)!.push(image);
  }

  let modelIndex = 1;
  for (const [productUrl, groupImages] of productGroups) {
    // Create identity
    const { data: identity, error: identityError } = await supabase
      .from('face_identities')
      .insert({
        scrape_run_id: runId,
        name: `Model ${String(modelIndex).padStart(2, '0')}`,
        gender,
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

    modelIndex++;
  }
}
