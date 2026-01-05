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

    // Fetch the scrape run
    const { data: run, error: runError } = await supabase
      .from('face_scrape_runs')
      .select('*')
      .eq('id', runId)
      .single();

    if (runError || !run) {
      console.error('Run not found:', runError);
      return new Response(
        JSON.stringify({ error: 'Scrape run not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if already completed
    if (run.status === 'completed') {
      return new Response(
        JSON.stringify({ success: true, message: 'Already completed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Resuming face scrape ${runId} from product ${run.progress}/${run.total}`);

    // Update status to running
    await supabase
      .from('face_scrape_runs')
      .update({ status: 'running' })
      .eq('id', runId);

    // Update pipeline job status if linked
    if (run.pipeline_job_id) {
      await supabase
        .from('pipeline_jobs')
        .update({ 
          status: 'RUNNING',
          progress_message: `Resuming from ${run.progress}/${run.total}`
        })
        .eq('id', run.pipeline_job_id);
    }

    // Start background job
    const backgroundPromise = resumeScrapeJob(
      runId, 
      run.start_url, 
      run.max_products, 
      run.images_per_product, 
      run.progress || 0,
      run.pipeline_job_id,
      supabase
    );
    (globalThis as any).EdgeRuntime?.waitUntil?.(backgroundPromise);

    return new Response(
      JSON.stringify({ success: true, message: 'Scrape resumed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error resuming face scrape:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function resumeScrapeJob(
  runId: string, 
  startUrl: string, 
  maxProducts: number, 
  imagesPerProduct: number, 
  startFrom: number,
  pipelineJobId: string | null,
  supabase: any
) {
  const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
  
  try {
    const urlObj = new URL(startUrl);
    const baseOrigin = urlObj.origin;
    
    console.log('Re-mapping website from origin:', baseOrigin);
    
    // Re-map the website to get product URLs
    const mapResponse = await fetch('https://api.firecrawl.dev/v1/map', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: baseOrigin,
        limit: 5000,
      }),
    });

    const mapData = await mapResponse.json();
    const allLinks: string[] = mapData.links || [];
    
    console.log(`Found ${allLinks.length} total links`);

    const startUrlGender = classifyGenderFromUrl(startUrl);
    
    const excludePatterns = [
      '/cart', '/checkout', '/account', '/login', '/register', '/search',
      '/filter', '/sort', '.css', '.js', '.json', '.xml', '.svg', '.png', '.jpg',
      '/category', '/categories', '/collection', '/collections', '/page/',
      '/help', '/faq', '/contact', '/about', '/blog', '/news', '/press',
      '/wishlist', '/compare', '/review', '/reviews', '/sitemap', '/privacy',
      '/terms', '/return', '/returns', '/delivery', '/shipping', '/size-guide',
      '/store-locator', '/stores', '/careers', '/jobs', '/newsletter',
      '/gift-card', '/promo', '/sale/', '/clearance',
    ];

    let productUrls = allLinks.filter((url: string) => {
      const lowerUrl = url.toLowerCase();
      const hasExcludePattern = excludePatterns.some(p => lowerUrl.includes(p));
      if (hasExcludePattern) return false;
      if (!url.startsWith(baseOrigin)) return false;
      
      const hasSkuAtEnd = /[a-z]{2}\d[a-z]{2}\d+[a-z0-9]*$/i.test(url);
      const hasSlugSku = /-[a-z]{2}\d[a-z]{2}\d+[a-z0-9]*$/i.test(url);
      const hasProductPath = /\/(product|item|p|pd|dp|style|detail)\/[^\/]+$/i.test(url);
      const hasProductId = /\/[A-Z0-9]{6,}$/i.test(url);
      
      return hasSkuAtEnd || hasSlugSku || hasProductPath || hasProductId;
    });

    if (productUrls.length === 0) {
      productUrls = allLinks.filter((url: string) => {
        const lowerUrl = url.toLowerCase();
        const hasExcludePattern = excludePatterns.some(p => lowerUrl.includes(p));
        if (hasExcludePattern) return false;
        if (!url.startsWith(baseOrigin)) return false;
        
        const pathParts = url.replace(baseOrigin, '').split('/').filter(Boolean);
        if (pathParts.length >= 2 && /^[a-z0-9-]+$/i.test(pathParts[pathParts.length - 1])) {
          return true;
        }
        return false;
      });
    }

    if (startUrlGender !== 'unknown' && productUrls.length > maxProducts) {
      const genderFiltered = productUrls.filter(url => {
        const urlGender = classifyGenderFromUrl(url);
        return urlGender === startUrlGender || urlGender === 'unknown';
      });
      if (genderFiltered.length >= maxProducts / 2) {
        productUrls = genderFiltered;
      }
    }

    productUrls = productUrls.slice(0, maxProducts);
    console.log(`Found ${productUrls.length} product URLs, resuming from ${startFrom}`);

    // Update total if it changed
    await supabase
      .from('face_scrape_runs')
      .update({ total: productUrls.length })
      .eq('id', runId);

    if (pipelineJobId) {
      await supabase
        .from('pipeline_jobs')
        .update({ progress_total: productUrls.length })
        .eq('id', pipelineJobId);
    }

    // Get existing image hashes to avoid duplicates
    const { data: existingImages } = await supabase
      .from('face_scrape_images')
      .select('image_hash')
      .eq('scrape_run_id', runId);
    
    const seenHashes = new Set<string>(
      (existingImages || []).map((img: { image_hash: string }) => img.image_hash).filter(Boolean)
    );

    // Resume from startFrom index
    for (let pIdx = startFrom; pIdx < productUrls.length; pIdx++) {
      const productUrl = productUrls[pIdx];
      
      try {
        // Update progress
        await supabase
          .from('face_scrape_runs')
          .update({ progress: pIdx + 1 })
          .eq('id', runId);

        if (pipelineJobId) {
          await supabase
            .from('pipeline_jobs')
            .update({ 
              progress_done: pIdx + 1,
              progress_message: `Scraping product ${pIdx + 1}/${productUrls.length}`
            })
            .eq('id', pipelineJobId);
        }

        console.log(`Scraping product ${pIdx + 1}/${productUrls.length}: ${productUrl}`);

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

        if (!html) {
          console.log(`No HTML returned for ${productUrl}`);
          continue;
        }

        const imageUrls = extractProductImages(html, productUrl, imagesPerProduct);
        const gender = classifyGenderFromUrl(productUrl);

        for (let i = 0; i < imageUrls.length; i++) {
          const imageUrl = imageUrls[i];
          const hash = simpleHash(imageUrl);
          
          if (seenHashes.has(hash)) continue;
          seenHashes.add(hash);

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
        }
      } catch (err) {
        console.error('Error scraping product:', productUrl, err);
      }
    }

    // Mark as completed
    await supabase
      .from('face_scrape_runs')
      .update({ 
        status: 'completed', 
        progress: productUrls.length,
      })
      .eq('id', runId);

    if (pipelineJobId) {
      await supabase
        .from('pipeline_jobs')
        .update({ 
          status: 'COMPLETED',
          progress_done: productUrls.length,
          completed_at: new Date().toISOString()
        })
        .eq('id', pipelineJobId);
    }

    console.log(`Face scrape resumed and completed: ${runId}`);
  } catch (error) {
    console.error('Resume face scrape failed:', error);
    await supabase
      .from('face_scrape_runs')
      .update({ status: 'failed' })
      .eq('id', runId);

    if (pipelineJobId) {
      await supabase
        .from('pipeline_jobs')
        .update({ status: 'FAILED' })
        .eq('id', pipelineJobId);
    }
  }
}

function extractProductImages(html: string, baseUrl: string, limit: number): string[] {
  const images: string[] = [];
  const origin = new URL(baseUrl).origin;
  
  const scene7Pattern = /["']([^"']+scene7[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi;
  let match;
  while ((match = scene7Pattern.exec(html)) !== null && images.length < limit) {
    const url = normalizeImageUrl(match[1], origin);
    if (url && !isExcludedImage(url) && !images.includes(url)) {
      images.push(url);
    }
  }
  
  const dataPatterns = [
    /data-src=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi,
    /data-zoom-image=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi,
    /data-large=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi,
    /data-original=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi,
  ];
  
  for (const pattern of dataPatterns) {
    while ((match = pattern.exec(html)) !== null && images.length < limit * 2) {
      const url = normalizeImageUrl(match[1], origin);
      if (url && !isExcludedImage(url) && !images.includes(url)) {
        images.push(url);
      }
    }
  }

  const jsonLdPattern = /"image"\s*:\s*\[?["']([^"'\]]+\.(?:jpg|jpeg|png|webp)[^"'\]]*)["']\]?/gi;
  while ((match = jsonLdPattern.exec(html)) !== null && images.length < limit * 2) {
    const url = normalizeImageUrl(match[1], origin);
    if (url && !isExcludedImage(url) && !images.includes(url)) {
      images.push(url);
    }
  }

  const srcsetPattern = /srcset=["']([^"']+)["']/gi;
  while ((match = srcsetPattern.exec(html)) !== null && images.length < limit * 2) {
    const srcset = match[1];
    const urls = srcset.split(',').map(s => s.trim().split(/\s+/)[0]);
    const bestUrl = urls[urls.length - 1];
    if (bestUrl) {
      const url = normalizeImageUrl(bestUrl, origin);
      if (url && !isExcludedImage(url) && !images.includes(url)) {
        images.push(url);
      }
    }
  }

  const imgPatterns = [
    /class=["'][^"']*(?:gallery|carousel|product-image|main-image)[^"']*["'][^>]*src=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi,
    /src=["']([^"']+\/(?:product|media|images?|gallery)[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi,
    /src=["']([^"']+\.(?:jpg|jpeg|png|webp))["']/gi,
  ];
  
  for (const pattern of imgPatterns) {
    while ((match = pattern.exec(html)) !== null && images.length < limit * 3) {
      const url = normalizeImageUrl(match[1], origin);
      if (url && !isExcludedImage(url) && !images.includes(url)) {
        images.push(url);
      }
    }
  }

  return images.slice(0, limit);
}

function normalizeImageUrl(src: string, origin: string): string | null {
  if (!src) return null;
  
  let url = src.trim();
  
  if (url.startsWith('//')) {
    url = 'https:' + url;
  } else if (url.startsWith('/')) {
    url = origin + url;
  } else if (!url.startsWith('http')) {
    url = origin + '/' + url;
  }
  
  try {
    const urlObj = new URL(url);
    const baseUrl = urlObj.origin + urlObj.pathname;
    return getHighResImageUrl(baseUrl);
  } catch {
    return null;
  }
}

function getHighResImageUrl(url: string): string {
  const lowerUrl = url.toLowerCase();
  
  if (lowerUrl.includes('scene7.com') || lowerUrl.includes('/is/image/')) {
    return `${url}?wid=2000&hei=2000&fmt=png-alpha&qlt=100`;
  }
  
  if (lowerUrl.includes('cloudinary.com')) {
    if (url.includes('/upload/')) {
      return url.replace('/upload/', '/upload/w_2000,h_2000,c_limit,q_100,f_png/');
    }
    return url;
  }
  
  if (lowerUrl.includes('cdn.shopify.com') || lowerUrl.includes('shopify.com/s/files')) {
    let highResUrl = url
      .replace(/_\d+x\d*/gi, '')
      .replace(/_pico|_icon|_thumb|_small|_compact|_medium|_large|_grande|_1024x1024|_2048x2048/gi, '');
    
    if (highResUrl.match(/\.(jpg|jpeg|webp)$/i)) {
      highResUrl = highResUrl.replace(/\.(jpg|jpeg|webp)$/i, '.png');
    }
    return highResUrl;
  }
  
  if (lowerUrl.includes('imgix.net')) {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}w=2000&h=2000&fit=max&q=100&fm=png`;
  }
  
  if (lowerUrl.includes('ctfassets.net') || lowerUrl.includes('contentful.com')) {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}w=2000&h=2000&q=100&fm=png`;
  }
  
  if (lowerUrl.includes('fastly') || url.includes('?')) {
    const urlObj = new URL(url);
    urlObj.searchParams.set('width', '2000');
    urlObj.searchParams.set('height', '2000');
    urlObj.searchParams.set('quality', '100');
    return urlObj.toString();
  }
  
  return url;
}

function isExcludedImage(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  const excludeTerms = [
    'thumb', 'thumbnail', 'icon', 'logo', 'sprite', 'placeholder',
    '50x', '100x', '150x', '200x', '1x1', 'blank', 'pixel',
    'loading', 'spinner', 'arrow', 'chevron', 'close', 'menu',
    'social', 'facebook', 'twitter', 'instagram', 'pinterest',
    'payment', 'visa', 'mastercard', 'paypal', 'badge', 'flag',
  ];
  return excludeTerms.some(term => lowerUrl.includes(term));
}

function classifyGenderFromUrl(url: string): 'men' | 'women' | 'unknown' {
  const lowerUrl = url.toLowerCase();
  
  const menPatterns = ['/men/', '/mens/', '/male/', '/him/', '/man/', 'gender=male', 'gender=men', '/gentlemen/'];
  const womenPatterns = ['/women/', '/womens/', '/female/', '/her/', '/woman/', 'gender=female', 'gender=women', '/ladies/'];
  
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