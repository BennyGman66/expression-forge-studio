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
    const { brandId, productUrl, jobId } = await req.json();

    if (!brandId || !productUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'brandId and productUrl are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing product: ${productUrl.substring(0, 80)}...`);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const slots = ['A', 'B', 'C', 'D'];

    // Initial gender guess from URL
    let urlGender: string | null = null;
    if (/\/men[\/\-s]|mens-|\/homme/i.test(productUrl)) {
      urlGender = 'men';
    } else if (/\/women[\/\-s]|womens-|\/femme/i.test(productUrl)) {
      urlGender = 'women';
    }

    // URL-based product type classification
    const urlProductType = classifyProductTypeFromUrl(productUrl);

    // Scrape the product page
    const scrapeController = new AbortController();
    const scrapeTimeoutId = setTimeout(() => scrapeController.abort(), 30000);

    let scrapeResponse;
    let scrapeData;
    try {
      scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlApiKey}`,
          'Content-Type': 'application/json',
        },
        signal: scrapeController.signal,
        body: JSON.stringify({
          url: productUrl,
          formats: ['html'],
          onlyMainContent: false,
          waitFor: 3000,
        }),
      });
      clearTimeout(scrapeTimeoutId);
      scrapeData = await scrapeResponse.json();
    } catch (err) {
      clearTimeout(scrapeTimeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        console.error('Scrape timed out after 30 seconds');
        return new Response(
          JSON.stringify({ success: false, error: 'Scrape timed out', skipped: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw err;
    }

    if (!scrapeResponse.ok || !scrapeData.success) {
      console.error('Failed to scrape product page');
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to scrape page', skipped: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const html = scrapeData.data?.html || '';
    const imageUrls = extractProductGalleryImages(html, productUrl);

    if (imageUrls.length === 0) {
      console.log('No images found for product');
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'No images found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${imageUrls.length} product images`);

    // Use AI to classify from the first image
    const classification = await classifyProductFromImage(imageUrls[0], urlProductType);
    const finalGender = classification.gender || urlGender;
    const finalProductType = classification.productType;

    console.log(`Classification: gender=${finalGender}, type=${finalProductType}`);

    // Create product record
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
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create product record' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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

    // Update job progress if jobId provided
    if (jobId) {
      await supabase
        .from('scrape_jobs')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', jobId);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        productId: product.id,
        imageCount: Math.min(imageUrls.length, 4),
        gender: finalGender,
        productType: finalProductType
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in scrape-product-single:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// URL-based product type classification
function classifyProductTypeFromUrl(url: string): 'tops' | 'trousers' | null {
  const urlLower = url.toLowerCase();
  
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
  
  return null;
}

// AI-powered classification
async function classifyProductFromImage(imageUrl: string, urlProductType: 'tops' | 'trousers' | null): Promise<{ gender: string | null; productType: string | null }> {
  try {
    console.log(`Classifying image: ${imageUrl.substring(0, 80)}...`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a fashion product classifier. Analyze the clothing image and determine:
1. Gender: Is this a men's or women's garment?
2. Product Type: Is this primarily a TOP or TROUSERS?

IMPORTANT: If the image shows a full outfit, look at the page context and focus area.`
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
                text: 'Classify this clothing item.'
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
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('AI classification failed:', response.status);
      return { gender: null, productType: urlProductType };
    }

    const data = await response.json();
    
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const args = JSON.parse(toolCall.function.arguments);
      console.log(`AI Classification result:`, args);
      
      const finalProductType = urlProductType || args.productType || null;
      
      return {
        gender: args.gender || null,
        productType: finalProductType
      };
    }

    return { gender: null, productType: urlProductType };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.error('AI classification timed out after 30 seconds');
    } else {
      console.error('Error classifying image:', err);
    }
    return { gender: null, productType: urlProductType };
  }
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

  // Scene7 image URLs
  const scene7Regex = /https?:\/\/[^"'\s]+scene7[^"'\s]+\.(jpg|jpeg|png|webp)/gi;
  let match;
  while ((match = scene7Regex.exec(html)) !== null) {
    const src = match[0].split('?')[0];
    if (src && !seenUrls.has(src) && !isExcludedImage(src)) {
      seenUrls.add(src);
      images.push(src);
    }
  }

  // High-res product images in data attributes
  const dataAttrRegex = /data-(?:zoom|large|full|high|src|lazy|main|image)(?:-image|-src)?=["']([^"']+)["']/gi;
  while ((match = dataAttrRegex.exec(html)) !== null) {
    const src = normalizeImageUrl(match[1], baseOrigin);
    if (src && !seenUrls.has(src) && !isExcludedImage(src)) {
      seenUrls.add(src);
      images.push(src);
    }
  }

  // JSON-LD structured data
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

  // srcset (get largest version)
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

  // Regular img tags in product contexts
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
