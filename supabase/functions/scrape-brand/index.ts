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
    await addLog('Starting site mapping...');
    
    // Step 1: Map the website to find category and product URLs
    const mapResponse = await fetch('https://api.firecrawl.dev/v1/map', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: startUrl,
        limit: 5000,
        includeSubdomains: false,
      }),
    });

    const mapData = await mapResponse.json();
    
    if (!mapResponse.ok || !mapData.success) {
      console.error('Map failed:', mapData);
      await updateJobStatus(supabase, jobId, 'failed', { error: 'Failed to map website' });
      return;
    }

    const allLinks = mapData.links || [];
    await addLog(`Found ${allLinks.length} total URLs on site`);

    // Step 2: Identify product page URLs (URLs that look like individual product pages)
    // Product pages typically have patterns like: /product/, /p/, /products/, or contain SKU-like patterns
    const productPatterns = [
      /\/product\//i,
      /\/products\//i,
      /\/p\//i,
      /\/item\//i,
      /\/[A-Z]{2}\d{5,}/i,  // SKU patterns like WW0WW12345
      /-[a-z]+-\d{5,}/i,    // slug-sku patterns
    ];
    
    // Exclude patterns that are definitely NOT product pages
    const excludePatterns = [
      /\/collections\//i,
      /\/category\//i,
      /\/search/i,
      /\/cart/i,
      /\/checkout/i,
      /\/account/i,
      /\/help/i,
      /\/faq/i,
      /\/about/i,
      /\/contact/i,
      /\/stores/i,
      /\/size-guide/i,
      /\.pdf$/i,
      /\?/,  // Query params usually indicate filters, not products
    ];

    // Find URLs that look like product pages
    let productUrls = allLinks.filter((url: string) => {
      // Must match at least one product pattern
      const matchesProduct = productPatterns.some(p => p.test(url));
      // Must NOT match any exclude pattern
      const matchesExclude = excludePatterns.some(p => p.test(url));
      return matchesProduct && !matchesExclude;
    });

    // If we didn't find product URLs with patterns, look for pages with long URL paths
    if (productUrls.length < limit) {
      const additionalUrls = allLinks.filter((url: string) => {
        // Check if URL has a path with multiple segments (likely a product)
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        // Products usually have 2+ path segments and the last one is long
        return pathParts.length >= 2 && 
               pathParts[pathParts.length - 1].length > 10 &&
               !excludePatterns.some(p => p.test(url)) &&
               !productUrls.includes(url);
      });
      productUrls = [...productUrls, ...additionalUrls];
    }

    // Separate by gender based on URL
    const menUrls = productUrls.filter((url: string) => 
      /\/men[\/\-]/i.test(url) || /\/homme/i.test(url) || /\/male/i.test(url)
    );
    const womenUrls = productUrls.filter((url: string) => 
      /\/women[\/\-]/i.test(url) || /\/femme/i.test(url) || /\/female/i.test(url)
    );
    const otherUrls = productUrls.filter((url: string) => 
      !menUrls.includes(url) && !womenUrls.includes(url)
    );

    await addLog(`Found ${menUrls.length} men's, ${womenUrls.length} women's, ${otherUrls.length} other products`);

    // Balance the selection between genders
    const halfLimit = Math.floor(limit / 2);
    const selectedUrls = [
      ...menUrls.slice(0, halfLimit),
      ...womenUrls.slice(0, halfLimit),
      ...otherUrls.slice(0, limit - Math.min(menUrls.length, halfLimit) - Math.min(womenUrls.length, halfLimit))
    ].slice(0, limit);

    await addLog(`Selected ${selectedUrls.length} products to scrape`);

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
        if (/\/men[\/\-]/i.test(productUrl) || /\/homme/i.test(productUrl)) {
          gender = 'men';
        } else if (/\/women[\/\-]/i.test(productUrl) || /\/femme/i.test(productUrl)) {
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
            waitFor: 2000, // Wait for images to load
          }),
        });

        const scrapeData = await scrapeResponse.json();

        if (scrapeResponse.ok && scrapeData.success) {
          const html = scrapeData.data?.html || '';
          
          // Extract product gallery images (main product images, not thumbnails)
          const imageUrls = extractProductGalleryImages(html, productUrl);
          
          await addLog(`  Found ${imageUrls.length} product images`);
          
          // Store up to 4 images (slots A-D: Front, 3/4, Back, Detail)
          for (let i = 0; i < Math.min(imageUrls.length, 4); i++) {
            await supabase
              .from('product_images')
              .insert({
                product_id: product.id,
                slot: slots[i],
                source_url: imageUrls[i],
                stored_url: imageUrls[i], // For now, use source URL directly
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

        // Small delay to be respectful to the server
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
  const patterns = [
    /\/([A-Z]{2}\d{5,})/i,           // WW0WW12345
    /[-_]([A-Z0-9]{6,12})(?:[-_]|$)/i, // SKU in slug
    /product\/([^\/]+)$/i,            // Last path segment
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1].toUpperCase();
  }
  return null;
}

function extractProductGalleryImages(html: string, baseUrl: string): string[] {
  const images: string[] = [];
  const seenUrls = new Set<string>();
  
  // Parse the base URL for resolving relative URLs
  let baseOrigin: string;
  try {
    baseOrigin = new URL(baseUrl).origin;
  } catch {
    baseOrigin = '';
  }

  // Look for high-resolution product images
  // Common patterns in e-commerce sites:
  // 1. data-zoom-image, data-large-image, data-src (lazy loading)
  // 2. srcset with high-res versions
  // 3. Images in product gallery containers

  // Pattern 1: Data attributes for zoom/large images (these are usually the high-res versions)
  const dataAttrRegex = /data-(?:zoom|large|full|high|src|lazy)(?:-image|-src)?=["']([^"']+)["']/gi;
  let match;
  while ((match = dataAttrRegex.exec(html)) !== null) {
    const src = normalizeImageUrl(match[1], baseOrigin);
    if (src && isValidProductImage(src) && !seenUrls.has(src)) {
      seenUrls.add(src);
      images.push(src);
    }
  }

  // Pattern 2: srcset (get the largest version)
  const srcsetRegex = /srcset=["']([^"']+)["']/gi;
  while ((match = srcsetRegex.exec(html)) !== null) {
    const srcset = match[1];
    // Parse srcset and get the largest image
    const sources = srcset.split(',').map(s => s.trim());
    let largestSrc = '';
    let largestWidth = 0;
    
    for (const source of sources) {
      const parts = source.split(/\s+/);
      if (parts.length >= 2) {
        const src = parts[0];
        const widthMatch = parts[1].match(/(\d+)w/);
        const width = widthMatch ? parseInt(widthMatch[1]) : 0;
        if (width > largestWidth) {
          largestWidth = width;
          largestSrc = src;
        }
      }
    }
    
    if (largestSrc) {
      const src = normalizeImageUrl(largestSrc, baseOrigin);
      if (src && isValidProductImage(src) && !seenUrls.has(src)) {
        seenUrls.add(src);
        images.push(src);
      }
    }
  }

  // Pattern 3: Regular img tags with large dimensions or product-related class names
  const imgRegex = /<img[^>]+>/gi;
  while ((match = imgRegex.exec(html)) !== null) {
    const imgTag = match[0];
    
    // Check if this looks like a product image (by class or context)
    const isProductImage = /class=["'][^"']*(product|gallery|pdp|hero|main|zoom)[^"']*["']/i.test(imgTag);
    const hasLargeWidth = /width=["']?(\d+)["']?/i.exec(imgTag);
    const width = hasLargeWidth ? parseInt(hasLargeWidth[1]) : 0;
    
    // Extract src
    const srcMatch = /src=["']([^"']+)["']/i.exec(imgTag);
    if (srcMatch) {
      const src = normalizeImageUrl(srcMatch[1], baseOrigin);
      if (src && isValidProductImage(src) && !seenUrls.has(src)) {
        // Prioritize images that look like product images or are large
        if (isProductImage || width >= 400) {
          seenUrls.add(src);
          images.push(src);
        }
      }
    }
  }

  // Pattern 4: Look for images in JSON-LD structured data
  const jsonLdRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const jsonContent = match[1];
      const data = JSON.parse(jsonContent);
      
      // Extract images from Product schema
      const extractFromSchema = (obj: any) => {
        if (obj?.image) {
          const imageData = Array.isArray(obj.image) ? obj.image : [obj.image];
          for (const img of imageData) {
            const src = typeof img === 'string' ? img : img?.url || img?.contentUrl;
            if (src) {
              const normalizedSrc = normalizeImageUrl(src, baseOrigin);
              if (normalizedSrc && !seenUrls.has(normalizedSrc)) {
                seenUrls.add(normalizedSrc);
                images.unshift(normalizedSrc); // Prioritize schema images
              }
            }
          }
        }
      };
      
      if (Array.isArray(data)) {
        data.forEach(extractFromSchema);
      } else {
        extractFromSchema(data);
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  // Return unique images, preferring larger/better quality versions
  return images.slice(0, 10);
}

function normalizeImageUrl(src: string, baseOrigin: string): string | null {
  if (!src || src.startsWith('data:')) return null;
  
  let url = src.trim();
  
  // Handle protocol-relative URLs
  if (url.startsWith('//')) {
    url = 'https:' + url;
  }
  // Handle relative URLs
  else if (url.startsWith('/')) {
    url = baseOrigin + url;
  }
  // Handle relative paths
  else if (!url.startsWith('http')) {
    url = baseOrigin + '/' + url;
  }
  
  return url;
}

function isValidProductImage(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  
  // Exclude non-product images
  const excludePatterns = [
    'icon', 'logo', 'sprite', 'spacer', 'pixel', 'tracking',
    'badge', 'rating', 'star', 'flag', 'payment', 'social',
    'facebook', 'twitter', 'instagram', 'pinterest',
    'svg', 'gif', 'placeholder', '1x1', 'blank',
    'thumbnail', 'thumb', '_xs', '_xxs', '_tiny', 'mini',
  ];
  
  if (excludePatterns.some(p => lowerUrl.includes(p))) {
    return false;
  }
  
  // Must be an image format
  if (!lowerUrl.match(/\.(jpg|jpeg|png|webp)/i) && 
      !lowerUrl.includes('/image') && 
      !lowerUrl.includes('/media')) {
    return false;
  }
  
  return true;
}
