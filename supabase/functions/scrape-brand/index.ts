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

    // Start background task for scraping (fire and forget)
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
  try {
    // Step 1: Map the website to find product URLs
    console.log('Mapping website to find product URLs...');
    
    const mapResponse = await fetch('https://api.firecrawl.dev/v1/map', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: startUrl,
        search: 'product',
        limit: limit * 10, // Get more URLs to filter
        includeSubdomains: false,
      }),
    });

    const mapData = await mapResponse.json();
    
    if (!mapResponse.ok || !mapData.success) {
      console.error('Map failed:', mapData);
      await updateJobStatus(supabase, jobId, 'failed', { error: 'Failed to map website' });
      return;
    }

    // Filter for product URLs (common patterns)
    const productPatterns = ['/product/', '/products/', '/p/', '/item/', '/shop/'];
    let productUrls = (mapData.links || []).filter((url: string) => 
      productPatterns.some(pattern => url.toLowerCase().includes(pattern))
    ).slice(0, limit);

    // If no product URLs found, try to use any URLs that look like products
    if (productUrls.length === 0) {
      productUrls = (mapData.links || []).slice(0, limit);
    }

    console.log(`Found ${productUrls.length} product URLs`);

    await supabase
      .from('scrape_jobs')
      .update({ total: productUrls.length, logs: [{ message: `Found ${productUrls.length} products`, time: new Date().toISOString() }] })
      .eq('id', jobId);

    // Step 2: Scrape each product page for images
    let processed = 0;
    const slots = ['A', 'B', 'C', 'D'];

    for (const productUrl of productUrls) {
      try {
        console.log(`[${processed + 1}/${productUrls.length}] Scraping ${productUrl}`);

        // Create product record
        const { data: product, error: productError } = await supabase
          .from('products')
          .insert({
            brand_id: brandId,
            product_url: productUrl,
            sku: extractSku(productUrl),
            gender: detectGender(productUrl),
          })
          .select()
          .single();

        if (productError) {
          console.error('Failed to create product:', productError);
          continue;
        }

        // Scrape the product page for images
        const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: productUrl,
            formats: ['html', 'links'],
            onlyMainContent: false,
          }),
        });

        const scrapeData = await scrapeResponse.json();

        if (scrapeResponse.ok && scrapeData.success) {
          // Extract image URLs from the page
          const imageUrls = extractProductImages(scrapeData.data?.html || '', productUrl);
          
          // Store up to 4 images (slots A-D)
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

          console.log(`  Found ${imageUrls.length} images for product`);
        }

        processed++;
        await supabase
          .from('scrape_jobs')
          .update({ progress: processed })
          .eq('id', jobId);

      } catch (err) {
        console.error(`Error processing ${productUrl}:`, err);
      }
    }

    // Mark job as complete
    await updateJobStatus(supabase, jobId, 'completed');
    console.log(`Scrape job ${jobId} completed: ${processed} products processed`);

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
    /\/([A-Z0-9]{6,})/i,
    /sku[=\/]([A-Z0-9-]+)/i,
    /product[=\/]([A-Z0-9-]+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function detectGender(url: string): string | null {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('/men') || lowerUrl.includes('/male') || lowerUrl.includes('/homme')) {
    return 'men';
  }
  if (lowerUrl.includes('/women') || lowerUrl.includes('/female') || lowerUrl.includes('/femme')) {
    return 'women';
  }
  return null;
}

function extractProductImages(html: string, baseUrl: string): string[] {
  const images: string[] = [];
  
  // Match img tags with src attributes
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;
  
  while ((match = imgRegex.exec(html)) !== null) {
    let src = match[1];
    
    // Skip small images, icons, logos
    if (src.includes('icon') || src.includes('logo') || src.includes('sprite')) {
      continue;
    }
    
    // Convert relative URLs to absolute
    if (src.startsWith('//')) {
      src = 'https:' + src;
    } else if (src.startsWith('/')) {
      const urlObj = new URL(baseUrl);
      src = urlObj.origin + src;
    }
    
    // Only include image URLs
    if (src.match(/\.(jpg|jpeg|png|webp)/i) || src.includes('image') || src.includes('media')) {
      images.push(src);
    }
  }
  
  // Also check for srcset and data-src
  const srcsetRegex = /(?:srcset|data-src)=["']([^"']+)["']/gi;
  while ((match = srcsetRegex.exec(html)) !== null) {
    const srcset = match[1].split(',')[0].split(' ')[0];
    if (srcset && !images.includes(srcset)) {
      let src = srcset;
      if (src.startsWith('//')) {
        src = 'https:' + src;
      } else if (src.startsWith('/')) {
        const urlObj = new URL(baseUrl);
        src = urlObj.origin + src;
      }
      images.push(src);
    }
  }
  
  // Remove duplicates and return first 10
  return [...new Set(images)].slice(0, 10);
}
