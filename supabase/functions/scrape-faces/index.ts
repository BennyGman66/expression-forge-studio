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
    // Update status to mapping
    await supabase
      .from('face_scrape_runs')
      .update({ status: 'mapping' })
      .eq('id', runId);

    // Get base origin for mapping (not the full startUrl which might be a category page)
    const urlObj = new URL(startUrl);
    const baseOrigin = urlObj.origin;
    
    console.log('Mapping website from origin:', baseOrigin);
    
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

    // Detect gender from the startUrl to focus scrape
    const startUrlGender = classifyGenderFromUrl(startUrl);
    console.log(`Start URL gender preference: ${startUrlGender}`);

    // Exclude patterns for non-product pages
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

    // Filter to find actual product URLs using SKU patterns (proven approach from scrape-brand)
    let productUrls = allLinks.filter((url: string) => {
      const lowerUrl = url.toLowerCase();
      
      // Check exclude patterns first
      const hasExcludePattern = excludePatterns.some(p => lowerUrl.includes(p));
      if (hasExcludePattern) return false;
      
      // Must be from same origin
      if (!url.startsWith(baseOrigin)) return false;
      
      // SKU pattern detection (like AB1CD2345 at end of URL - common e-commerce pattern)
      const hasSkuAtEnd = /[a-z]{2}\d[a-z]{2}\d+[a-z0-9]*$/i.test(url);
      // Slug-SKU pattern (like product-name-AB1CD2345)
      const hasSlugSku = /-[a-z]{2}\d[a-z]{2}\d+[a-z0-9]*$/i.test(url);
      // Standard product path patterns
      const hasProductPath = /\/(product|item|p|pd|dp|style|detail)\/[^\/]+$/i.test(url);
      // URL ends with alphanumeric product identifier
      const hasProductId = /\/[A-Z0-9]{6,}$/i.test(url);
      
      return hasSkuAtEnd || hasSlugSku || hasProductPath || hasProductId;
    });

    console.log(`Found ${productUrls.length} product URLs after SKU/pattern filtering`);

    // If still no products found, try fallback patterns
    if (productUrls.length === 0) {
      console.log('No products found with SKU patterns, trying fallback...');
      productUrls = allLinks.filter((url: string) => {
        const lowerUrl = url.toLowerCase();
        const hasExcludePattern = excludePatterns.some(p => lowerUrl.includes(p));
        if (hasExcludePattern) return false;
        if (!url.startsWith(baseOrigin)) return false;
        
        // Fallback: URLs with many path segments ending in alphanumeric
        const pathParts = url.replace(baseOrigin, '').split('/').filter(Boolean);
        if (pathParts.length >= 2 && /^[a-z0-9-]+$/i.test(pathParts[pathParts.length - 1])) {
          // Looks like a product slug
          return true;
        }
        return false;
      });
      console.log(`Fallback found ${productUrls.length} potential product URLs`);
    }

    // Filter by gender if start URL had gender context
    if (startUrlGender !== 'unknown' && productUrls.length > maxProducts) {
      const genderFiltered = productUrls.filter(url => {
        const urlGender = classifyGenderFromUrl(url);
        return urlGender === startUrlGender || urlGender === 'unknown';
      });
      if (genderFiltered.length >= maxProducts / 2) {
        productUrls = genderFiltered;
        console.log(`Filtered to ${productUrls.length} URLs for gender: ${startUrlGender}`);
      }
    }

    productUrls = productUrls.slice(0, maxProducts);
    console.log(`Processing ${productUrls.length} product URLs`);

    // Update status to running
    await supabase
      .from('face_scrape_runs')
      .update({ 
        status: 'running',
        total: productUrls.length,
        progress: 0
      })
      .eq('id', runId);

    if (productUrls.length === 0) {
      await supabase
        .from('face_scrape_runs')
        .update({ status: 'completed', total: 0, progress: 0 })
        .eq('id', runId);
      console.log('No products found, marking as completed');
      return;
    }

    const seenHashes = new Set<string>();

    for (let pIdx = 0; pIdx < productUrls.length; pIdx++) {
      const productUrl = productUrls[pIdx];
      
      try {
        // Update progress
        await supabase
          .from('face_scrape_runs')
          .update({ progress: pIdx + 1, total: productUrls.length })
          .eq('id', runId);

        console.log(`Scraping product ${pIdx + 1}/${productUrls.length}: ${productUrl}`);

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

        if (!html) {
          console.log(`No HTML returned for ${productUrl}`);
          continue;
        }

        // Extract image URLs from the page
        const imageUrls = extractProductImages(html, productUrl, imagesPerProduct);
        console.log(`Found ${imageUrls.length} images on ${productUrl}`);
        
        // Classify gender from URL
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

    // Get final image count
    const { count } = await supabase
      .from('face_scrape_images')
      .select('*', { count: 'exact', head: true })
      .eq('scrape_run_id', runId);

    // Mark as completed
    await supabase
      .from('face_scrape_runs')
      .update({ 
        status: 'completed', 
        progress: productUrls.length,
        total: productUrls.length
      })
      .eq('id', runId);

    console.log(`Face scrape completed: ${runId}, ${count || 0} images from ${productUrls.length} products`);
  } catch (error) {
    console.error('Face scrape job failed:', error);
    await supabase
      .from('face_scrape_runs')
      .update({ status: 'failed' })
      .eq('id', runId);
  }
}

function extractProductImages(html: string, baseUrl: string, limit: number): string[] {
  const images: string[] = [];
  const origin = new URL(baseUrl).origin;
  
  // Priority 1: Scene7 or high-quality product gallery URLs
  const scene7Pattern = /["']([^"']+scene7[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi;
  let match;
  while ((match = scene7Pattern.exec(html)) !== null && images.length < limit) {
    const url = normalizeImageUrl(match[1], origin);
    if (url && !isExcludedImage(url) && !images.includes(url)) {
      images.push(url);
    }
  }
  
  // Priority 2: Data attributes (often contain high-res images)
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

  // Priority 3: JSON-LD structured data
  const jsonLdPattern = /"image"\s*:\s*\[?["']([^"'\]]+\.(?:jpg|jpeg|png|webp)[^"'\]]*)["']\]?/gi;
  while ((match = jsonLdPattern.exec(html)) !== null && images.length < limit * 2) {
    const url = normalizeImageUrl(match[1], origin);
    if (url && !isExcludedImage(url) && !images.includes(url)) {
      images.push(url);
    }
  }

  // Priority 4: Srcset (usually contains multiple resolutions)
  const srcsetPattern = /srcset=["']([^"']+)["']/gi;
  while ((match = srcsetPattern.exec(html)) !== null && images.length < limit * 2) {
    const srcset = match[1];
    const urls = srcset.split(',').map(s => s.trim().split(/\s+/)[0]);
    // Get highest resolution (last one or largest number)
    const bestUrl = urls[urls.length - 1];
    if (bestUrl) {
      const url = normalizeImageUrl(bestUrl, origin);
      if (url && !isExcludedImage(url) && !images.includes(url)) {
        images.push(url);
      }
    }
  }

  // Priority 5: Regular img src with product/gallery context
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
  
  // Handle protocol-relative URLs
  if (url.startsWith('//')) {
    url = 'https:' + url;
  } 
  // Handle relative URLs
  else if (url.startsWith('/')) {
    url = origin + url;
  }
  // Handle relative paths without leading slash
  else if (!url.startsWith('http')) {
    url = origin + '/' + url;
  }
  
  // Remove query params that might be for sizing (keep the URL simpler)
  // But keep essential params like those with hash/version info
  try {
    const urlObj = new URL(url);
    return urlObj.origin + urlObj.pathname;
  } catch {
    return null;
  }
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
