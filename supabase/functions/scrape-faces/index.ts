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
    const { startUrl, brandName, maxProducts = 200, imagesPerProduct = 4 } = await req.json();

    if (!startUrl) {
      return new Response(
        JSON.stringify({ error: 'Start URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Create scrape run record
    const { data: run, error: runError } = await supabase
      .from('face_scrape_runs')
      .insert({
        brand_name: brandName,
        start_url: startUrl,
        max_products: maxProducts,
        images_per_product: imagesPerProduct,
        status: 'running',
      })
      .select()
      .single();

    if (runError) throw runError;

    // Start background job using waitUntil if available, otherwise fire-and-forget
    const backgroundPromise = runScrapeJob(run.id, startUrl, maxProducts, imagesPerProduct, supabase);
    (globalThis as any).EdgeRuntime?.waitUntil?.(backgroundPromise);

    return new Response(
      JSON.stringify({ success: true, runId: run.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error starting face scrape:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function runScrapeJob(runId: string, startUrl: string, maxProducts: number, imagesPerProduct: number, supabase: any) {
  const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
  
  try {
    // Map the website to find product URLs
    console.log('Mapping website:', startUrl);
    
    const mapResponse = await fetch('https://api.firecrawl.dev/v1/map', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: startUrl,
        limit: 5000,
      }),
    });

    const mapData = await mapResponse.json();
    const allLinks = mapData.links || [];
    
    // Filter for product-like URLs
    const productPatterns = ['/product/', '/p/', '/pd/', '/dp/', '/item/', '/products/'];
    const excludePatterns = ['/cart', '/checkout', '/account', '/login', '/search', '/filter', '.css', '.js', '.json'];
    
    const productUrls = allLinks.filter((url: string) => {
      const lowerUrl = url.toLowerCase();
      const hasProductPattern = productPatterns.some(p => lowerUrl.includes(p));
      const hasExcludePattern = excludePatterns.some(p => lowerUrl.includes(p));
      return hasProductPattern && !hasExcludePattern;
    }).slice(0, maxProducts);

    console.log(`Found ${productUrls.length} product URLs`);

    // Update total
    await supabase
      .from('face_scrape_runs')
      .update({ total: productUrls.length * imagesPerProduct })
      .eq('id', runId);

    let progress = 0;
    const seenHashes = new Set<string>();

    for (const productUrl of productUrls) {
      try {
        // Scrape the product page
        const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: productUrl,
            formats: ['html'],
          }),
        });

        const scrapeData = await scrapeResponse.json();
        const html = scrapeData.data?.html || '';

        // Extract image URLs from the page
        const imageUrls = extractModelImages(html, productUrl, imagesPerProduct);
        
        // Classify gender from URL
        const gender = classifyGenderFromUrl(productUrl);

        for (let i = 0; i < imageUrls.length; i++) {
          const imageUrl = imageUrls[i];
          const hash = simpleHash(imageUrl);
          
          if (seenHashes.has(hash)) continue;
          seenHashes.add(hash);

          // Store the image record
          await supabase
            .from('face_scrape_images')
            .insert({
              scrape_run_id: runId,
              source_url: imageUrl,
              product_url: productUrl,
              image_index: i,
              image_hash: hash,
              gender: gender,
              gender_source: gender !== 'unknown' ? 'url' : 'unknown',
            });

          progress++;
          
          // Update progress periodically
          if (progress % 10 === 0) {
            await supabase
              .from('face_scrape_runs')
              .update({ progress })
              .eq('id', runId);
          }
        }
      } catch (err) {
        console.error('Error scraping product:', productUrl, err);
      }
    }

    // Mark as completed
    await supabase
      .from('face_scrape_runs')
      .update({ status: 'completed', progress })
      .eq('id', runId);

    console.log('Face scrape completed:', runId);
  } catch (error) {
    console.error('Face scrape job failed:', error);
    await supabase
      .from('face_scrape_runs')
      .update({ status: 'failed' })
      .eq('id', runId);
  }
}

function extractModelImages(html: string, baseUrl: string, limit: number): string[] {
  const images: string[] = [];
  const origin = new URL(baseUrl).origin;
  
  // Look for high-quality image URLs in various patterns
  const patterns = [
    /src="([^"]+(?:model|look|outfit|wear)[^"]*\.(?:jpg|jpeg|png|webp))"/gi,
    /data-src="([^"]+\.(?:jpg|jpeg|png|webp))"/gi,
    /srcset="([^\s"]+\.(?:jpg|jpeg|png|webp))/gi,
    /"image":\s*"([^"]+\.(?:jpg|jpeg|png|webp))"/gi,
    /src="([^"]+\/(?:product|media|image)[^"]*\.(?:jpg|jpeg|png|webp))"/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null && images.length < limit * 3) {
      let url = match[1];
      
      // Skip thumbnails and icons
      if (url.includes('thumb') || url.includes('icon') || url.includes('logo') || url.includes('50x') || url.includes('100x')) {
        continue;
      }
      
      // Normalize URL
      if (url.startsWith('//')) {
        url = 'https:' + url;
      } else if (url.startsWith('/')) {
        url = origin + url;
      }
      
      if (!images.includes(url)) {
        images.push(url);
      }
    }
  }

  return images.slice(0, limit);
}

function classifyGenderFromUrl(url: string): 'men' | 'women' | 'unknown' {
  const lowerUrl = url.toLowerCase();
  
  const menPatterns = ['/men', '/mens', '/male', '/him', '/man', 'gender=male', 'gender=men'];
  const womenPatterns = ['/women', '/womens', '/female', '/her', '/woman', 'gender=female', 'gender=women'];
  
  for (const pattern of menPatterns) {
    if (lowerUrl.includes(pattern)) return 'men';
  }
  
  for (const pattern of womenPatterns) {
    if (lowerUrl.includes(pattern)) return 'women';
  }
  
  return 'unknown';
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}
