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

// Helper function to verify authentication
async function verifyAuth(req: Request): Promise<{ userId: string | null; error: Response | null }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      userId: null,
      error: new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    };
  }

  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const token = authHeader.replace('Bearer ', '');
  const { data, error } = await supabase.auth.getClaims(token);
  
  if (error || !data?.claims) {
    return {
      userId: null,
      error: new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    };
  }

  return { userId: data.claims.sub as string, error: null };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const { userId, error: authError } = await verifyAuth(req);
    if (authError) {
      return authError;
    }
    console.log(`Authenticated user: ${userId}`);

    const { brandId, startUrl, limit = 10 } = await req.json();

    if (!brandId || !startUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'brandId and startUrl are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting URL mapping for brand ${brandId} from ${startUrl}, limit: ${limit}`);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse the base URL
    const urlObj = new URL(startUrl);
    const baseOrigin = urlObj.origin;
    
    console.log('Starting site mapping...');
    
    // Map the website to find all product URLs
    const mapController = new AbortController();
    const mapTimeoutId = setTimeout(() => mapController.abort(), 60000);
    
    let mapResponse;
    try {
      mapResponse = await fetch('https://api.firecrawl.dev/v1/map', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlApiKey}`,
          'Content-Type': 'application/json',
        },
        signal: mapController.signal,
        body: JSON.stringify({
          url: baseOrigin,
          limit: 10000,
          includeSubdomains: false,
        }),
      });
      clearTimeout(mapTimeoutId);
    } catch (err) {
      clearTimeout(mapTimeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        console.error('Site mapping timed out after 60 seconds');
        return new Response(
          JSON.stringify({ success: false, error: 'Site mapping timed out' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw err;
    }

    const mapData = await mapResponse.json();
    
    if (!mapResponse.ok || !mapData.success) {
      console.error('Map failed:', mapData);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to map website' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const allLinks: string[] = mapData.links || [];
    console.log(`Found ${allLinks.length} total URLs on site`);

    // Identify product page URLs
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

    console.log(`Found ${productUrls.length} potential product URLs`);

    // Fallback detection if no products found
    let finalProductUrls = productUrls;
    if (productUrls.length === 0) {
      console.log('No SKU patterns found, trying fallback detection...');
      
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
      
      console.log(`Fallback found ${finalProductUrls.length} potential products`);
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

    console.log(`URL categorization: ${menUrls.length} men's, ${womenUrls.length} women's, ${otherUrls.length} other`);

    // Balance the selection based on start URL
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

    console.log(`Selected ${selectedUrls.length} products to return`);

    // Create scrape job record - frontend will orchestrate the actual scraping
    // Store product URLs for resume capability
    const { data: job, error: jobError } = await supabase
      .from('scrape_jobs')
      .insert({ 
        brand_id: brandId, 
        status: 'pending', 
        progress: 0, 
        total: selectedUrls.length,
        product_urls: selectedUrls,
        current_index: 0,
        logs: [{ time: new Date().toISOString(), message: `Mapped ${allLinks.length} URLs, selected ${selectedUrls.length} products` }]
      })
      .select()
      .single();

    if (jobError) {
      console.error('Failed to create job:', jobError);
      throw new Error('Failed to create scrape job');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        jobId: job.id,
        productUrls: selectedUrls,
        totalFound: allLinks.length,
        productsSelected: selectedUrls.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error in scrape-brand:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Service temporarily unavailable' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
