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
const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

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

// URL-based product type classification (more reliable than AI for bottoms)
function classifyProductTypeFromUrl(url: string): 'tops' | 'trousers' | null {
  const urlLower = url.toLowerCase();
  
  // Check for bottoms keywords first
  const bottomsKeywords = [
    'jean', 'jeans', 'chino', 'chinos', 'pant', 'pants', 
    'short', 'shorts', 'trouser', 'trousers', 'skirt', 'skirts',
    'legging', 'leggings', 'jogger', 'joggers', 'cargo',
    'denim', 'slim-fit', 'straight-leg', 'wide-leg', 'bootcut',
    'culottes', 'capri', 'bermuda'
  ];
  
  for (const keyword of bottomsKeywords) {
    if (urlLower.includes(keyword)) {
      return 'trousers';
    }
  }
  
  // Check for tops keywords
  const topsKeywords = [
    'shirt', 'tshirt', 't-shirt', 'blouse', 'top', 'sweater',
    'hoodie', 'jacket', 'coat', 'polo', 'vest', 'cardigan',
    'pullover', 'sweatshirt', 'blazer', 'jumper', 'tee'
  ];
  
  for (const keyword of topsKeywords) {
    if (urlLower.includes(keyword)) {
      return 'tops';
    }
  }
  
  return null; // No clear signal from URL
}

// AI-powered classification using Lovable AI vision (used as fallback)
async function classifyProductFromImage(imageUrl: string, urlProductType: 'tops' | 'trousers' | null): Promise<{ gender: string | null; productType: string | null }> {
  try {
    console.log(`Classifying image: ${imageUrl.substring(0, 80)}...`);
    
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a fashion product classifier. Analyze the clothing image and determine:
1. Gender: Is this a men's or women's garment? Look at the fit, style, and typical gender association.
2. Product Type: Is this primarily a TOP (shirt, t-shirt, jacket, sweater, blouse, coat, hoodie, polo, vest) or TROUSERS (pants, jeans, shorts, skirt, leggings)?

IMPORTANT: If the image shows a full outfit with both top and bottom visible:
- Look at the page context and focus area
- If the bottom garment (pants, jeans, shorts) appears to be the main focus, classify as "trousers"
- Only classify as "tops" if the top garment is clearly the main product being sold
- When in doubt and both are equally prominent, prefer "trousers" if the bottom looks like pants/jeans/shorts

If you cannot determine with confidence, respond with null.`
          },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: imageUrl }
              },
              {
                type: 'text',
                text: 'Classify this clothing item. Respond with a JSON object: {"gender": "men" or "women" or null, "productType": "tops" or "trousers" or null}'
              }
            ]
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'classify_product',
              description: 'Classify a clothing product by gender and type',
              parameters: {
                type: 'object',
                properties: {
                  gender: {
                    type: 'string',
                    enum: ['men', 'women'],
                    description: 'The target gender for this garment'
                  },
                  productType: {
                    type: 'string',
                    enum: ['tops', 'trousers'],
                    description: 'Whether this is a top or bottom/trousers'
                  }
                },
                required: []
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'classify_product' } },
        max_tokens: 150
      }),
    });

    if (!response.ok) {
      console.error('AI classification failed:', response.status);
      // Return URL-based product type if AI fails
      return { gender: null, productType: urlProductType };
    }

    const data = await response.json();
    
    // Extract from tool call
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const args = JSON.parse(toolCall.function.arguments);
      console.log(`AI Classification result:`, args);
      
      // URL-based product type takes precedence over AI classification
      // because it's more reliable for identifying bottoms
      const finalProductType = urlProductType || args.productType || null;
      
      return {
        gender: args.gender || null,
        productType: finalProductType
      };
    }

    return { gender: null, productType: urlProductType };
  } catch (err) {
    console.error('Error classifying image:', err);
    return { gender: null, productType: urlProductType };
  }
}

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
    const mapResponse = await fetch('https://api.firecrawl.dev/v1/map', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: baseOrigin,
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
    
    console.log('Sample URLs:', allLinks.slice(0, 20));

    // Step 2: Identify product page URLs
    const productUrls = allLinks.filter((url: string) => {
      const hasSkuAtEnd = /[a-z]{2}\d[a-z]{2}\d+[a-z0-9]*$/i.test(url);
      const hasProductPath = /\/(product|item|p)\/[^\/]+$/i.test(url);
      const hasSlugSku = /-[a-z]{2}\d[a-z]{2}\d+[a-z0-9]*$/i.test(url);
      const isSameDomain = url.startsWith(baseOrigin);
      
      const excludePatterns = [
        /\/collections\//i, /\/category\//i, /\/c\//i,
        /\/search/i, /\/cart/i, /\/checkout/i, /\/account/i,
        /\/help/i, /\/faq/i, /\/about/i, /\/contact/i,
        /\/stores/i, /\/store\//i, /\/size-guide/i,
        /\/terms/i, /\/privacy/i, /\/returns/i, /\/shipping/i,
        /\/wishlist/i, /\/login/i, /\/register/i,
        /\.pdf$/i, /\?/,
      ];
      
      const matchesExclude = excludePatterns.some(p => p.test(url));
      
      return isSameDomain && (hasSkuAtEnd || hasProductPath || hasSlugSku) && !matchesExclude;
    });

    await addLog(`Found ${productUrls.length} potential product URLs`);
    console.log('Sample product URLs:', productUrls.slice(0, 10));

    // Fallback detection if no products found
    let finalProductUrls = productUrls;
    if (productUrls.length === 0) {
      await addLog('No SKU patterns found, trying fallback detection...');
      
      finalProductUrls = allLinks.filter((url: string) => {
        const isSameDomain = url.startsWith(baseOrigin);
        const pathParts = new URL(url).pathname.split('/').filter(Boolean);
        const isLikelyProduct = pathParts.length === 1 && 
                                pathParts[0].length > 20 && 
                                pathParts[0].includes('-');
        
        const excludePatterns = [
          /^mens?-/i, /^womens?-/i, /^kids?-/i,
          /-sale$/i, /-new$/i,
          /^sale/i, /^about/i, /^help/i, /^contact/i,
        ];
        
        const matchesExclude = excludePatterns.some(p => p.test(pathParts[0] || ''));
        
        return isSameDomain && isLikelyProduct && !matchesExclude;
      });
      
      await addLog(`Fallback found ${finalProductUrls.length} potential products`);
    }

    // Separate by gender based on URL path (initial guess)
    const menUrls = finalProductUrls.filter((url: string) => 
      /\/men[\/\-s]|mens-|\/homme/i.test(url)
    );
    const womenUrls = finalProductUrls.filter((url: string) => 
      /\/women[\/\-s]|womens-|\/femme/i.test(url)
    );
    const otherUrls = finalProductUrls.filter((url: string) => 
      !menUrls.includes(url) && !womenUrls.includes(url)
    );

    await addLog(`URL-based categorization: ${menUrls.length} men's, ${womenUrls.length} women's, ${otherUrls.length} other`);

    // Balance the selection
    let selectedUrls: string[] = [];
    const startUrlLower = startUrl.toLowerCase();
    
    if (startUrlLower.includes('/men') || startUrlLower.includes('mens')) {
      selectedUrls = [...menUrls.slice(0, limit), ...otherUrls.slice(0, limit - menUrls.length)].slice(0, limit);
    } else if (startUrlLower.includes('/women') || startUrlLower.includes('womens')) {
      selectedUrls = [...womenUrls.slice(0, limit), ...otherUrls.slice(0, limit - womenUrls.length)].slice(0, limit);
    } else {
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

        // Initial gender guess from URL
        let urlGender: string | null = null;
        if (/\/men[\/\-s]|mens-|\/homme/i.test(productUrl)) {
          urlGender = 'men';
        } else if (/\/women[\/\-s]|womens-|\/femme/i.test(productUrl)) {
          urlGender = 'women';
        }

        // Scrape the product page first to get images
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
            waitFor: 3000,
          }),
        });

        const scrapeData = await scrapeResponse.json();

        if (!scrapeResponse.ok || !scrapeData.success) {
          await addLog(`  Failed to scrape product page`);
          processed++;
          await supabase.from('scrape_jobs').update({ progress: processed }).eq('id', jobId);
          continue;
        }

        const html = scrapeData.data?.html || '';
        const imageUrls = extractProductGalleryImages(html, productUrl);
        
        await addLog(`  Found ${imageUrls.length} product images`);

        if (imageUrls.length === 0) {
          processed++;
          await supabase.from('scrape_jobs').update({ progress: processed }).eq('id', jobId);
          continue;
        }

        // First try URL-based product type classification (more reliable for bottoms)
        const urlProductType = classifyProductTypeFromUrl(productUrl);
        if (urlProductType) {
          await addLog(`  URL-based product type: ${urlProductType}`);
        }
        
        // Use AI to classify from the first image (main product image)
        await addLog(`  Classifying product with AI vision...`);
        const classification = await classifyProductFromImage(imageUrls[0], urlProductType);
        
        // Use AI classification if available, fall back to URL-based gender
        const finalGender = classification.gender || urlGender;
        const finalProductType = classification.productType;
        
        await addLog(`  Classification: gender=${finalGender}, type=${finalProductType}`);

        // Create product record with classification
        const { data: product, error: productError } = await supabase
          .from('products')
          .insert({
            brand_id: brandId,
            product_url: productUrl,
            sku: extractSku(productUrl),
            gender: finalGender,
            product_type: finalProductType,
          })
          .select()
          .single();

        if (productError) {
          console.error('Failed to create product:', productError);
          processed++;
          await supabase.from('scrape_jobs').update({ progress: processed }).eq('id', jobId);
          continue;
        }

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
        processed++;
        await supabase.from('scrape_jobs').update({ progress: processed }).eq('id', jobId);
      }
    }

    // Mark job as complete
    await updateJobStatus(supabase, jobId, 'completed');
    await addLog(`Completed: ${processed} products scraped with AI classification`);

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
  const tommyMatch = url.match(/[_-]([a-z]{2}\d[a-z]{2}\d+[a-z0-9]*)$/i);
  if (tommyMatch) return tommyMatch[1].toUpperCase();
  
  const pathMatch = url.match(/\/(?:product|item|p)\/([^\/]+)$/i);
  if (pathMatch) return pathMatch[1].toUpperCase();
  
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

  // Priority 1: Scene7 image URLs
  const scene7Regex = /https?:\/\/[^"'\s]+scene7[^"'\s]+\.(jpg|jpeg|png|webp)/gi;
  let match;
  while ((match = scene7Regex.exec(html)) !== null) {
    const src = match[0].split('?')[0];
    if (src && !seenUrls.has(src) && !isExcludedImage(src)) {
      seenUrls.add(src);
      images.push(src);
    }
  }

  // Priority 2: High-res product images in data attributes
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
                images.unshift(normalized);
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
    
    const isProductContext = /class=["'][^"']*(product|gallery|pdp|hero|main|carousel|slider)[^"']*["']/i.test(imgTag);
    
    if (src && !seenUrls.has(src) && !isExcludedImage(src) && isProductContext) {
      seenUrls.add(src);
      images.push(src);
    }
  }

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
  return excludes.some(ex => lower.includes(ex));
}
