import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { brandId, startUrl, limit = 10 } = await req.json();

    if (!brandId || !startUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'brandId and startUrl are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting scrape for brand ${brandId} from ${startUrl}, limit: ${limit}`);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Create scrape job
    const { data: job, error: jobError } = await supabase
      .from('scrape_jobs')
      .insert({ brand_id: brandId, status: 'running', progress: 0, total: 0 })
      .select()
      .single();

    if (jobError) {
      console.error('Failed to create job:', jobError);
      throw new Error('Failed to create scrape job');
    }

    console.log(`Created scrape job ${job.id}`);

    // Start background task for scraping
    runScrapeJob(supabase, job.id, brandId, startUrl, limit).catch(err => {
      console.error('Background scrape failed:', err);
    });

    return new Response(
      JSON.stringify({ success: true, jobId: job.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in scrape-brand:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function runScrapeJob(
  supabase: any,
  jobId: string,
  brandId: string,
  startUrl: string,
  limit: number
) {
  const logs: Array<{ time: string; message: string }> = [];
  
  const addLog = async (message: string) => {
    console.log(message);
    logs.push({ time: new Date().toISOString(), message });
    await supabase
      .from('scrape_jobs')
      .update({ logs })
      .eq('id', jobId);
  };

  try {
    // Parse the base URL
    const urlObj = new URL(startUrl);
    const baseOrigin = urlObj.origin;
    
    await addLog('Starting site mapping...');
    
    // Step 1: Map the entire website from root to find all product URLs
    // Use root domain for better coverage
    const mapResponse = await fetch('https://api.firecrawl.dev/v1/map', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: baseOrigin,  // Map from root for full coverage
        limit: 10000,
        includeSubdomains: false,
      }),
    });

    const mapData = await mapResponse.json();
    
    if (!mapResponse.ok || !mapData.success) {
      console.error('Map failed:', mapData);
      await updateJobStatus(supabase, jobId, 'failed', { error: 'Failed to map website' });
      return;
    }

    const allLinks: string[] = mapData.links || [];
    await addLog(`Found ${allLinks.length} total URLs on site`);
    
    // Log some sample URLs for debugging
    console.log('Sample URLs:', allLinks.slice(0, 20));

    // Step 2: Identify product page URLs
    // Product URLs typically end with a SKU pattern or have product-like paths
    const productUrls = allLinks.filter((url: string) => {
      // Check for SKU patterns at end of URL (common e-commerce pattern)
      // Examples: mw0mw17770d03, ww0ww12345abc
      const hasSkuAtEnd = /[a-z]{2}\d[a-z]{2}\d+[a-z0-9]*$/i.test(url);
      
      // Check for common product path patterns
      const hasProductPath = /\/(product|item|p)\/[^\/]+$/i.test(url);
      
      // Check for slug-sku pattern (product-name-sku123)
      const hasSlugSku = /-[a-z]{2}\d[a-z]{2}\d+[a-z0-9]*$/i.test(url);
      
      // Must be on the same domain
      const isSameDomain = url.startsWith(baseOrigin);
      
      // Exclude patterns that are NOT product pages
      const excludePatterns = [
        /\/collections\//i,
        /\/category\//i,
        /\/c\//i,           // Category shorthand
        /\/search/i,
        /\/cart/i,
        /\/checkout/i,
        /\/account/i,
        /\/help/i,
        /\/faq/i,
        /\/about/i,
        /\/contact/i,
        /\/stores/i,
        /\/store\//i,
        /\/size-guide/i,
        /\/terms/i,
        /\/privacy/i,
        /\/returns/i,
        /\/shipping/i,
        /\/wishlist/i,
        /\/login/i,
        /\/register/i,
        /\.pdf$/i,
        /\?/,  // Query params usually indicate filters
      ];
      
      const matchesExclude = excludePatterns.some(p => p.test(url));
      
      return isSameDomain && (hasSkuAtEnd || hasProductPath || hasSlugSku) && !matchesExclude;
    });

    await addLog(`Found ${productUrls.length} potential product URLs`);
    console.log('Sample product URLs:', productUrls.slice(0, 10));

    // If no products found with SKU patterns, try a fallback: longer URL paths
    let finalProductUrls = productUrls;
    if (productUrls.length === 0) {
      await addLog('No SKU patterns found, trying fallback detection...');
      
      finalProductUrls = allLinks.filter((url: string) => {
        const isSameDomain = url.startsWith(baseOrigin);
        const pathParts = new URL(url).pathname.split('/').filter(Boolean);
        
        // Products typically have a single path segment that's long (product slug)
        // and NOT matching category patterns
        const isLikelyProduct = pathParts.length === 1 && 
                                pathParts[0].length > 20 && 
                                pathParts[0].includes('-');
        
        const excludePatterns = [
          /^mens?-/i, /^womens?-/i, /^kids?-/i,  // Category prefixes
          /-sale$/i, /-new$/i,
          /^sale/i, /^about/i, /^help/i, /^contact/i,
        ];
        
        const matchesExclude = excludePatterns.some(p => p.test(pathParts[0] || ''));
        
        return isSameDomain && isLikelyProduct && !matchesExclude;
      });
      
      await addLog(`Fallback found ${finalProductUrls.length} potential products`);
    }

    // Separate by gender based on URL path
    const menUrls = finalProductUrls.filter((url: string) => 
      /\/men[\/\-s]|mens-|\/homme/i.test(url)
    );
    const womenUrls = finalProductUrls.filter((url: string) => 
      /\/women[\/\-s]|womens-|\/femme/i.test(url)
    );
    const otherUrls = finalProductUrls.filter((url: string) => 
      !menUrls.includes(url) && !womenUrls.includes(url)
    );

    await addLog(`Categorized: ${menUrls.length} men's, ${womenUrls.length} women's, ${otherUrls.length} unisex/other`);

    // Balance the selection between genders, with priority based on start URL
    let selectedUrls: string[] = [];
    const startUrlLower = startUrl.toLowerCase();
    
    if (startUrlLower.includes('/men') || startUrlLower.includes('mens')) {
      // Prioritize men's products
      selectedUrls = [...menUrls.slice(0, limit), ...otherUrls.slice(0, limit - menUrls.length)].slice(0, limit);
    } else if (startUrlLower.includes('/women') || startUrlLower.includes('womens')) {
      // Prioritize women's products
      selectedUrls = [...womenUrls.slice(0, limit), ...otherUrls.slice(0, limit - womenUrls.length)].slice(0, limit);
    } else {
      // Mix both
      const halfLimit = Math.ceil(limit / 2);
      selectedUrls = [
        ...menUrls.slice(0, halfLimit),
        ...womenUrls.slice(0, halfLimit),
        ...otherUrls.slice(0, limit)
      ].slice(0, limit);
    }

    await addLog(`Selected ${selectedUrls.length} products to scrape`);

    if (selectedUrls.length === 0) {
      await addLog('No products found to scrape. Check URL patterns.');
      await updateJobStatus(supabase, jobId, 'completed');
      return;
    }

    await supabase
      .from('scrape_jobs')
      .update({ total: selectedUrls.length })
      .eq('id', jobId);

    // Step 3: Scrape each product page for images
    let processed = 0;
    const slots = ['A', 'B', 'C', 'D'];

    for (const productUrl of selectedUrls) {
      try {
        await addLog(`[${processed + 1}/${selectedUrls.length}] Scraping: ${productUrl.substring(0, 80)}...`);

        // Determine gender from URL
        let gender = null;
        if (/\/men[\/\-s]|mens-|\/homme/i.test(productUrl)) {
          gender = 'men';
        } else if (/\/women[\/\-s]|womens-|\/femme/i.test(productUrl)) {
          gender = 'women';
        }

        // Create product record
        const { data: product, error: productError } = await supabase
          .from('products')
          .insert({
            brand_id: brandId,
            product_url: productUrl,
            sku: extractSku(productUrl),
            gender,
          })
          .select()
          .single();

        if (productError) {
          console.error('Failed to create product:', productError);
          continue;
        }

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
            onlyMainContent: false,
            waitFor: 3000, // Wait for images to load
          }),
        });

        const scrapeData = await scrapeResponse.json();

        if (scrapeResponse.ok && scrapeData.success) {
          const html = scrapeData.data?.html || '';
          
          // Extract product gallery images
          const imageUrls = extractProductGalleryImages(html, productUrl);
          
          await addLog(`  Found ${imageUrls.length} product images`);
          
          // Store up to 4 images (slots A-D)
          for (let i = 0; i < Math.min(imageUrls.length, 4); i++) {
            await supabase
              .from('product_images')
              .insert({
                product_id: product.id,
                slot: slots[i],
                source_url: imageUrls[i],
                stored_url: imageUrls[i],
              });
          }
        } else {
          await addLog(`  Failed to scrape product page`);
        }

        processed++;
        await supabase
          .from('scrape_jobs')
          .update({ progress: processed })
          .eq('id', jobId);

        // Small delay to be respectful
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (err) {
        console.error(`Error processing ${productUrl}:`, err);
        await addLog(`  Error: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    }

    // Mark job as complete
    await updateJobStatus(supabase, jobId, 'completed');
    await addLog(`Completed: ${processed} products scraped`);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Scrape job failed:', errorMessage);
    await updateJobStatus(supabase, jobId, 'failed', { error: errorMessage });
  }
}

async function updateJobStatus(supabase: any, jobId: string, status: string, extra: any = {}) {
  await supabase
    .from('scrape_jobs')
    .update({ status, ...extra, updated_at: new Date().toISOString() })
    .eq('id', jobId);
}

function extractSku(url: string): string | null {
  // Try to extract SKU from URL patterns
  // Pattern: slug-MW0MW17770D03 (Tommy style)
  const tommyMatch = url.match(/[_-]([a-z]{2}\d[a-z]{2}\d+[a-z0-9]*)$/i);
  if (tommyMatch) return tommyMatch[1].toUpperCase();
  
  // Pattern: /product/SKU or /p/SKU
  const pathMatch = url.match(/\/(?:product|item|p)\/([^\/]+)$/i);
  if (pathMatch) return pathMatch[1].toUpperCase();
  
  // Generic: last path segment if it looks like a SKU
  const lastSegment = url.split('/').pop() || '';
  if (/^[A-Z0-9-_]{6,}$/i.test(lastSegment)) {
    return lastSegment.toUpperCase();
  }
  
  return null;
}

function extractProductGalleryImages(html: string, baseUrl: string): string[] {
  const images: string[] = [];
  const seenUrls = new Set<string>();
  
  let baseOrigin: string;
  try {
    baseOrigin = new URL(baseUrl).origin;
  } catch {
    baseOrigin = '';
  }

  // Priority 1: Scene7 image URLs (used by many fashion brands)
  const scene7Regex = /https?:\/\/[^"'\s]+scene7[^"'\s]+\.(jpg|jpeg|png|webp)/gi;
  let match;
  while ((match = scene7Regex.exec(html)) !== null) {
    const src = match[0].split('?')[0]; // Remove query params to get base image
    if (src && !seenUrls.has(src) && !isExcludedImage(src)) {
      seenUrls.add(src);
      images.push(src);
    }
  }

  // Priority 2: Look for high-res product images in data attributes
  const dataAttrRegex = /data-(?:zoom|large|full|high|src|lazy|main|image)(?:-image|-src)?=["']([^"']+)["']/gi;
  while ((match = dataAttrRegex.exec(html)) !== null) {
    const src = normalizeImageUrl(match[1], baseOrigin);
    if (src && !seenUrls.has(src) && !isExcludedImage(src)) {
      seenUrls.add(src);
      images.push(src);
    }
  }

  // Priority 3: JSON-LD structured data
  const jsonLdRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const extractImages = (obj: any) => {
        if (obj?.image) {
          const imgs = Array.isArray(obj.image) ? obj.image : [obj.image];
          for (const img of imgs) {
            const src = typeof img === 'string' ? img : img?.url || img?.contentUrl;
            if (src) {
              const normalized = normalizeImageUrl(src, baseOrigin);
              if (normalized && !seenUrls.has(normalized) && !isExcludedImage(normalized)) {
                seenUrls.add(normalized);
                images.unshift(normalized); // Schema images are high priority
              }
            }
          }
        }
      };
      if (Array.isArray(data)) data.forEach(extractImages);
      else extractImages(data);
    } catch { /* ignore */ }
  }

  // Priority 4: srcset (get largest version)
  const srcsetRegex = /srcset=["']([^"']+)["']/gi;
  while ((match = srcsetRegex.exec(html)) !== null) {
    const sources = match[1].split(',').map(s => s.trim());
    let largestSrc = '';
    let largestWidth = 0;
    
    for (const source of sources) {
      const parts = source.split(/\s+/);
      if (parts.length >= 2) {
        const widthMatch = parts[1].match(/(\d+)w/);
        const width = widthMatch ? parseInt(widthMatch[1]) : 0;
        if (width > largestWidth && width >= 500) {
          largestWidth = width;
          largestSrc = parts[0];
        }
      }
    }
    
    if (largestSrc) {
      const src = normalizeImageUrl(largestSrc, baseOrigin);
      if (src && !seenUrls.has(src) && !isExcludedImage(src)) {
        seenUrls.add(src);
        images.push(src);
      }
    }
  }

  // Priority 5: Regular img tags in product contexts
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  while ((match = imgRegex.exec(html)) !== null) {
    const imgTag = match[0];
    const src = normalizeImageUrl(match[1], baseOrigin);
    
    // Check if this looks like a product image
    const isProductContext = /class=["'][^"']*(product|gallery|pdp|hero|main|carousel|slider)[^"']*["']/i.test(imgTag);
    
    if (src && !seenUrls.has(src) && !isExcludedImage(src) && isProductContext) {
      seenUrls.add(src);
      images.push(src);
    }
  }

  // Dedupe and return top 10
  return [...new Set(images)].slice(0, 10);
}

function normalizeImageUrl(src: string, baseOrigin: string): string | null {
  if (!src || src.startsWith('data:')) return null;
  
  let url = src.trim();
  
  if (url.startsWith('//')) {
    url = 'https:' + url;
  } else if (url.startsWith('/')) {
    url = baseOrigin + url;
  } else if (!url.startsWith('http')) {
    url = baseOrigin + '/' + url;
  }
  
  return url;
}

function isExcludedImage(url: string): boolean {
  const lower = url.toLowerCase();
  const excludes = [
    'icon', 'logo', 'sprite', 'spacer', 'pixel', 'tracking',
    'badge', 'rating', 'star', 'flag', 'payment', 'social',
    'facebook', 'twitter', 'instagram', 'pinterest',
    '.svg', '.gif', 'placeholder', '1x1', 'blank',
    'thumbnail', 'thumb', '_xs', '_xxs', '_tiny', 'mini',
    '_50', '_100', '_150', 'w_50', 'w_100', 'h_50', 'h_100',
  ];
  return excludes.some(e => lower.includes(e));
}
