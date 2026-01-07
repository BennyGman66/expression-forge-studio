import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type PipelineJob = {
  id: string;
  type: string;
  status: string;
  origin_context: Record<string, unknown>;
  progress_done: number;
  progress_failed: number;
  progress_total: number;
  source_job_id: string | null;
};

type ResumeHandler = (supabase: any, job: PipelineJob) => Promise<void>;

// ============== HANDLER REGISTRY ==============
// Add new job type handlers here - no frontend changes needed!
const RESUME_HANDLERS: Record<string, ResumeHandler> = {
  CLAY_GENERATION: resumeClayGeneration,
  SCRAPE_FACES: resumeFaceScrape,
  REPOSE_GENERATION: resumeReposeGeneration,
  ORGANIZE_FACES: resumeOrganizeFaces,
  CLASSIFY_FACES: resumeClassifyFaces,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { jobId } = await req.json();

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: "jobId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[resume-pipeline-job] Starting resume for job ${jobId}`);

    // Get the pipeline job
    const { data: job, error: jobError } = await supabase
      .from("pipeline_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      console.error(`[resume-pipeline-job] Job not found:`, jobError);
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the handler for this job type
    const handler = RESUME_HANDLERS[job.type];
    
    if (!handler) {
      console.log(`[resume-pipeline-job] No handler for job type: ${job.type}`);
      return new Response(
        JSON.stringify({ 
          error: `No resume handler for job type: ${job.type}`,
          supported: Object.keys(RESUME_HANDLERS)
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Set job status to RUNNING
    await supabase
      .from("pipeline_jobs")
      .update({ 
        status: "RUNNING",
        started_at: new Date().toISOString(),
        progress_message: "Resuming..."
      })
      .eq("id", jobId);

    // Start background processing with the appropriate handler
    EdgeRuntime.waitUntil(
      handler(supabase, job).catch(async (error) => {
        console.error(`[resume-pipeline-job] Handler error for ${job.type}:`, error);
        await markJobFailed(supabase, jobId, error instanceof Error ? error.message : "Unknown error");
      })
    );

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `${job.type} job resume started in background`,
        jobId,
        type: job.type
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[resume-pipeline-job] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ============== SHARED UTILITIES ==============

async function markJobFailed(supabase: any, jobId: string, message: string) {
  await supabase
    .from("pipeline_jobs")
    .update({
      status: "FAILED",
      completed_at: new Date().toISOString(),
      progress_message: message
    })
    .eq("id", jobId);
}

async function checkJobCanceled(supabase: any, jobId: string): Promise<boolean> {
  const { data: job } = await supabase
    .from("pipeline_jobs")
    .select("status")
    .eq("id", jobId)
    .single();
  return job?.status === "CANCELED" || job?.status === "PAUSED";
}

// ============== CLAY_GENERATION HANDLER ==============

async function resumeClayGeneration(supabase: any, job: PipelineJob) {
  const context = job.origin_context || {};
  const brandId = context.brandId as string;
  const slots = (context.slots as string[]) || ["A", "B", "C", "D"];
  const model = (context.model as string) || "google/gemini-2.5-flash-image-preview";

  if (!brandId) {
    throw new Error("Job context missing brandId");
  }

  console.log(`[resume-pipeline-job/clay] Processing remaining images for brand ${brandId}, slots: ${slots.join(",")}`);

  // Get all product images for this brand/slots that DON'T have clay images yet
  const { data: pendingImages, error: queryError } = await supabase
    .from("product_images")
    .select(`
      id,
      stored_url,
      source_url,
      slot,
      products!inner(brand_id)
    `)
    .eq("products.brand_id", brandId)
    .in("slot", slots);

  if (queryError) {
    throw new Error("Failed to query images: " + queryError.message);
  }

  // Get existing clay images to filter out already-processed
  const imageIds = pendingImages.map((img: any) => img.id);
  const { data: existingClays } = await supabase
    .from("clay_images")
    .select("product_image_id")
    .in("product_image_id", imageIds);

  const existingSet = new Set((existingClays || []).map((c: any) => c.product_image_id));
  const remaining = pendingImages.filter((img: any) => !existingSet.has(img.id));

  console.log(`[resume-pipeline-job/clay] Found ${remaining.length} remaining images to process`);

  if (remaining.length === 0) {
    await supabase
      .from("pipeline_jobs")
      .update({
        status: "COMPLETED",
        completed_at: new Date().toISOString(),
        progress_message: "All images already processed"
      })
      .eq("id", job.id);
    return;
  }

  const alreadyDone = existingSet.size;
  await supabase
    .from("pipeline_jobs")
    .update({
      progress_done: alreadyDone,
      progress_message: `Resuming from ${alreadyDone}/${alreadyDone + remaining.length}`
    })
    .eq("id", job.id);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < remaining.length; i++) {
    if (await checkJobCanceled(supabase, job.id)) {
      console.log(`[resume-pipeline-job/clay] Job ${job.id} was canceled/paused, stopping`);
      break;
    }

    const img = remaining[i];
    try {
      const response = await supabase.functions.invoke("generate-clay-single", {
        body: { imageId: img.id, model }
      });
      if (response.error) {
        failCount++;
      } else {
        successCount++;
      }
    } catch (err) {
      console.error(`[resume-pipeline-job/clay] Exception for image ${img.id}:`, err);
      failCount++;
    }

    await supabase
      .from("pipeline_jobs")
      .update({
        progress_done: alreadyDone + successCount + failCount,
        progress_failed: failCount,
        progress_message: `Processing ${i + 1}/${remaining.length}`,
        updated_at: new Date().toISOString()
      })
      .eq("id", job.id);

    await new Promise(r => setTimeout(r, 500));
  }

  await supabase
    .from("pipeline_jobs")
    .update({
      status: failCount > 0 && successCount === 0 ? "FAILED" : "COMPLETED",
      completed_at: new Date().toISOString(),
      progress_message: failCount > 0 
        ? `Completed with ${failCount} failures`
        : "Completed successfully"
    })
    .eq("id", job.id);

  console.log(`[resume-pipeline-job/clay] Finished job ${job.id}: ${successCount} success, ${failCount} failed`);
}

// ============== SCRAPE_FACES HANDLER ==============

async function resumeFaceScrape(supabase: any, job: PipelineJob) {
  // Get scrape run ID from context or source_job_id
  const scrapeRunId = (job.origin_context?.scrape_run_id as string) || job.source_job_id;
  
  if (!scrapeRunId) {
    throw new Error("Job context missing scrape_run_id");
  }

  // Fetch the scrape run
  const { data: run, error: runError } = await supabase
    .from("face_scrape_runs")
    .select("*")
    .eq("id", scrapeRunId)
    .single();

  if (runError || !run) {
    throw new Error("Scrape run not found");
  }

  if (run.status === "completed") {
    await supabase
      .from("pipeline_jobs")
      .update({
        status: "COMPLETED",
        completed_at: new Date().toISOString(),
        progress_message: "Already completed"
      })
      .eq("id", job.id);
    return;
  }

  console.log(`[resume-pipeline-job/scrape] Resuming from product ${run.progress}/${run.total}`);

  // Update scrape run status
  await supabase
    .from("face_scrape_runs")
    .update({ status: "running" })
    .eq("id", scrapeRunId);

  // Call the actual scrape resume logic (reusing existing function invocation)
  const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!firecrawlApiKey) {
    throw new Error("FIRECRAWL_API_KEY not configured");
  }

  const urlObj = new URL(run.start_url);
  const baseOrigin = urlObj.origin;
  
  console.log(`[resume-pipeline-job/scrape] Re-mapping website from origin: ${baseOrigin}`);
  
  // Map the website to get product URLs
  const mapResponse = await fetch("https://api.firecrawl.dev/v1/map", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${firecrawlApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: baseOrigin,
      limit: 5000,
    }),
  });

  const mapData = await mapResponse.json();
  const allLinks: string[] = mapData.links || [];
  
  const excludePatterns = [
    "/cart", "/checkout", "/account", "/login", "/register", "/search",
    "/filter", "/sort", ".css", ".js", ".json", ".xml", ".svg", ".png", ".jpg",
    "/category", "/categories", "/collection", "/collections", "/page/",
    "/help", "/faq", "/contact", "/about", "/blog", "/news", "/press",
    "/wishlist", "/compare", "/review", "/reviews", "/sitemap", "/privacy",
    "/terms", "/return", "/returns", "/delivery", "/shipping", "/size-guide",
    "/store-locator", "/stores", "/careers", "/jobs", "/newsletter",
    "/gift-card", "/promo", "/sale/", "/clearance",
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
      
      const pathParts = url.replace(baseOrigin, "").split("/").filter(Boolean);
      if (pathParts.length >= 2 && /^[a-z0-9-]+$/i.test(pathParts[pathParts.length - 1])) {
        return true;
      }
      return false;
    });
  }

  productUrls = productUrls.slice(0, run.max_products);
  console.log(`[resume-pipeline-job/scrape] Found ${productUrls.length} product URLs, resuming from ${run.progress}`);

  await supabase
    .from("face_scrape_runs")
    .update({ total: productUrls.length })
    .eq("id", scrapeRunId);

  await supabase
    .from("pipeline_jobs")
    .update({ progress_total: productUrls.length })
    .eq("id", job.id);

  // Get existing image hashes
  const { data: existingImages } = await supabase
    .from("face_scrape_images")
    .select("image_hash")
    .eq("scrape_run_id", scrapeRunId);
  
  const seenHashes = new Set<string>(
    (existingImages || []).map((img: { image_hash: string }) => img.image_hash).filter(Boolean)
  );

  // Resume from saved progress
  for (let pIdx = run.progress || 0; pIdx < productUrls.length; pIdx++) {
    if (await checkJobCanceled(supabase, job.id)) {
      console.log(`[resume-pipeline-job/scrape] Job ${job.id} was canceled/paused, stopping`);
      break;
    }

    const productUrl = productUrls[pIdx];
    
    try {
      await supabase
        .from("face_scrape_runs")
        .update({ progress: pIdx + 1 })
        .eq("id", scrapeRunId);

      await supabase
        .from("pipeline_jobs")
        .update({ 
          progress_done: pIdx + 1,
          progress_message: `Scraping product ${pIdx + 1}/${productUrls.length}`
        })
        .eq("id", job.id);

      const scrapeResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${firecrawlApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: productUrl,
          formats: ["html"],
        }),
      });

      const scrapeData = await scrapeResponse.json();
      const html = scrapeData.data?.html || "";

      if (!html) continue;

      const imageUrls = extractProductImages(html, productUrl, run.images_per_product);
      const gender = classifyGenderFromUrl(productUrl);

      for (let i = 0; i < imageUrls.length; i++) {
        const imageUrl = imageUrls[i];
        const hash = simpleHash(imageUrl);
        
        if (seenHashes.has(hash)) continue;
        seenHashes.add(hash);

        await supabase
          .from("face_scrape_images")
          .insert({
            scrape_run_id: scrapeRunId,
            source_url: imageUrl,
            product_url: productUrl,
            image_index: i,
            image_hash: hash,
            gender: gender,
            gender_source: gender !== "unknown" ? "url" : "unknown",
          });
      }
    } catch (err) {
      console.error("[resume-pipeline-job/scrape] Error scraping product:", productUrl, err);
    }
  }

  // Mark as completed
  await supabase
    .from("face_scrape_runs")
    .update({ 
      status: "completed", 
      progress: productUrls.length,
    })
    .eq("id", scrapeRunId);

  await supabase
    .from("pipeline_jobs")
    .update({ 
      status: "COMPLETED",
      progress_done: productUrls.length,
      completed_at: new Date().toISOString(),
      progress_message: "Completed successfully"
    })
    .eq("id", job.id);

  console.log(`[resume-pipeline-job/scrape] Finished job ${job.id}`);
}

// ============== REPOSE_GENERATION HANDLER ==============

async function resumeReposeGeneration(supabase: any, job: PipelineJob) {
  const context = job.origin_context || {};
  const batchId = context.batchId as string;
  const model = (context.model as string) || "google/gemini-2.5-flash";

  if (!batchId) {
    throw new Error("Job context missing batchId");
  }

  // Reset any stuck 'running' outputs to 'queued'
  await supabase
    .from("repose_outputs")
    .update({ status: "queued" })
    .eq("batch_id", batchId)
    .eq("status", "running");

  // Update batch status to RUNNING
  await supabase
    .from("repose_batches")
    .update({ status: "RUNNING" })
    .eq("id", batchId);

  console.log(`[resume-pipeline-job/repose] Processing queued outputs for batch ${batchId}`);

  // Get all queued outputs for this batch
  const { data: queuedOutputs, error: queryError } = await supabase
    .from("repose_outputs")
    .select("id")
    .eq("batch_id", batchId)
    .eq("status", "queued");

  if (queryError) {
    throw new Error("Failed to query outputs: " + queryError.message);
  }

  console.log(`[resume-pipeline-job/repose] Found ${queuedOutputs?.length || 0} queued outputs to process`);

  if (!queuedOutputs || queuedOutputs.length === 0) {
    const { data: allOutputs } = await supabase
      .from("repose_outputs")
      .select("status")
      .eq("batch_id", batchId);

    const completed = allOutputs?.filter((o: any) => o.status === "complete").length || 0;
    const failed = allOutputs?.filter((o: any) => o.status === "failed").length || 0;

    await supabase
      .from("pipeline_jobs")
      .update({
        status: "COMPLETED",
        completed_at: new Date().toISOString(),
        progress_done: completed,
        progress_failed: failed,
        progress_message: "All outputs already processed"
      })
      .eq("id", job.id);

    await supabase
      .from("repose_batches")
      .update({ status: "COMPLETE" })
      .eq("id", batchId);

    return;
  }

  let successCount = job.progress_done || 0;
  let failCount = job.progress_failed || 0;
  const total = job.progress_total || (successCount + failCount + queuedOutputs.length);

  for (let i = 0; i < queuedOutputs.length; i++) {
    if (await checkJobCanceled(supabase, job.id)) {
      console.log(`[resume-pipeline-job/repose] Job ${job.id} was canceled/paused, stopping`);
      break;
    }

    const output = queuedOutputs[i];
    try {
      const response = await supabase.functions.invoke("generate-repose-single", {
        body: { outputId: output.id, model }
      });

      if (response.error) {
        failCount++;
      } else {
        successCount++;
      }
    } catch (err) {
      console.error(`[resume-pipeline-job/repose] Exception for output ${output.id}:`, err);
      failCount++;
    }

    await supabase
      .from("pipeline_jobs")
      .update({
        progress_done: successCount,
        progress_failed: failCount,
        progress_message: `Processing ${successCount + failCount}/${total}`,
        updated_at: new Date().toISOString()
      })
      .eq("id", job.id);

    await new Promise(r => setTimeout(r, 500));
  }

  const finalStatus = failCount > 0 && successCount === 0 ? "FAILED" : "COMPLETED";
  await supabase
    .from("pipeline_jobs")
    .update({
      status: finalStatus,
      completed_at: new Date().toISOString(),
      progress_message: failCount > 0 
        ? `Completed with ${failCount} failures`
        : "Completed successfully"
    })
    .eq("id", job.id);

  await supabase
    .from("repose_batches")
    .update({ 
      status: finalStatus === "COMPLETED" ? "COMPLETE" : "FAILED" 
    })
    .eq("id", batchId);

  console.log(`[resume-pipeline-job/repose] Finished job ${job.id}: ${successCount} success, ${failCount} failed`);
}

// ============== ORGANIZE_FACES HANDLER ==============

async function resumeOrganizeFaces(supabase: any, job: PipelineJob) {
  const context = job.origin_context || {};
  const scrapeRunId = context.scrape_run_id as string;
  const processedIds = (context.processed_ids as string[]) || [];

  if (!scrapeRunId) {
    throw new Error("Job context missing scrape_run_id");
  }

  console.log(`[resume-pipeline-job/organize] Resuming organize for scrape run ${scrapeRunId}, ${processedIds.length} already processed`);

  // Invoke organize-face-images with the existing job ID and processed context
  // This allows it to resume from where it left off instead of creating a new job
  try {
    const response = await supabase.functions.invoke("organize-face-images", {
      body: { 
        scrapeRunId, 
        resumeJobId: job.id,
        resumeFromContext: { processed_ids: processedIds }
      }
    });

    if (response.error) {
      throw new Error(response.error.message || "organize-face-images failed");
    }

    // The organize-face-images function will update the job status when complete
    console.log(`[resume-pipeline-job/organize] Organization resumed for job ${job.id}`);
  } catch (err) {
    console.error(`[resume-pipeline-job/organize] Error:`, err);
    await supabase
      .from("pipeline_jobs")
      .update({
        status: "FAILED",
        completed_at: new Date().toISOString(),
        progress_message: err instanceof Error ? err.message : "Unknown error"
      })
      .eq("id", job.id);
  }
}

// ============== CLASSIFY_FACES HANDLER ==============

async function resumeClassifyFaces(supabase: any, job: PipelineJob) {
  const context = job.origin_context || {};
  const scrapeRunId = context.scrape_run_id as string;
  const currentStep = (context.current_step as number) || 1;
  
  // Extract step3 indices for inner-loop resumption
  const step3Index = (context.step3Index as number) || 0;
  const step3InnerIndex = (context.step3InnerIndex as number) || 0;

  if (!scrapeRunId) {
    throw new Error("Job context missing scrape_run_id");
  }

  console.log(`[resume-pipeline-job/classify] Resuming classification for scrape run ${scrapeRunId} from step ${currentStep} (step3Index=${step3Index}, step3InnerIndex=${step3InnerIndex})`);

  // Update job status
  await supabase
    .from("pipeline_jobs")
    .update({
      progress_message: `Resuming from step ${currentStep}...`
    })
    .eq("id", job.id);

  // Build resume context - pass through step3 indices for proper inner loop resumption
  const resumeContext: Record<string, number> = {};
  if (currentStep === 3) {
    resumeContext.step3Index = step3Index;
    resumeContext.step3InnerIndex = step3InnerIndex;
  }

  // Invoke the classify-all function to continue processing
  try {
    const response = await supabase.functions.invoke("classify-all", {
      body: { 
        runId: scrapeRunId, 
        pipelineJobId: job.id,
        resumeFromStep: currentStep,
        resumeContext
      }
    });

    if (response.error) {
      throw new Error(response.error.message || "Classification failed");
    }

    // The classify-all function will update the job status when complete
    console.log(`[resume-pipeline-job/classify] Classification resumed for job ${job.id}`);
  } catch (err) {
    console.error(`[resume-pipeline-job/classify] Error:`, err);
    await supabase
      .from("pipeline_jobs")
      .update({
        status: "FAILED",
        completed_at: new Date().toISOString(),
        progress_message: err instanceof Error ? err.message : "Unknown error"
      })
      .eq("id", job.id);
  }
}

// ============== HELPER FUNCTIONS (for SCRAPE_FACES) ==============

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
    const urls = srcset.split(",").map(s => s.trim().split(/\s+/)[0]);
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
  
  if (url.startsWith("//")) {
    url = "https:" + url;
  } else if (url.startsWith("/")) {
    url = origin + url;
  } else if (!url.startsWith("http")) {
    url = origin + "/" + url;
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
  
  if (lowerUrl.includes("scene7.com") || lowerUrl.includes("/is/image/")) {
    return `${url}?wid=2000&hei=2000&fmt=png-alpha&qlt=100`;
  }
  
  if (lowerUrl.includes("cloudinary.com")) {
    if (url.includes("/upload/")) {
      return url.replace("/upload/", "/upload/w_2000,h_2000,c_limit,q_100,f_png/");
    }
    return url;
  }
  
  if (lowerUrl.includes("cdn.shopify.com") || lowerUrl.includes("shopify.com/s/files")) {
    let highResUrl = url
      .replace(/_\d+x\d*/gi, "")
      .replace(/_pico|_icon|_thumb|_small|_compact|_medium|_large|_grande|_1024x1024|_2048x2048/gi, "");
    
    if (highResUrl.match(/\.(jpg|jpeg|webp)$/i)) {
      highResUrl = highResUrl.replace(/\.(jpg|jpeg|webp)$/i, ".png");
    }
    return highResUrl;
  }
  
  if (lowerUrl.includes("imgix.net")) {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}w=2000&h=2000&fit=max&q=100&fm=png`;
  }
  
  if (lowerUrl.includes("ctfassets.net") || lowerUrl.includes("contentful.com")) {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}w=2000&h=2000&q=100&fm=png`;
  }
  
  if (lowerUrl.includes("fastly") || url.includes("?")) {
    const urlObj = new URL(url);
    urlObj.searchParams.set("width", "2000");
    urlObj.searchParams.set("height", "2000");
    urlObj.searchParams.set("quality", "100");
    return urlObj.toString();
  }
  
  return url;
}

function isExcludedImage(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  const excludeTerms = [
    "thumb", "thumbnail", "icon", "logo", "sprite", "placeholder",
    "50x", "100x", "150x", "200x", "1x1", "blank", "pixel",
    "loading", "spinner", "arrow", "chevron", "close", "menu",
    "social", "facebook", "twitter", "instagram", "pinterest",
    "payment", "visa", "mastercard", "paypal", "badge", "flag",
  ];
  return excludeTerms.some(term => lowerUrl.includes(term));
}

function classifyGenderFromUrl(url: string): "men" | "women" | "unknown" {
  const lowerUrl = url.toLowerCase();
  
  const menPatterns = ["/men/", "/mens/", "/male/", "/him/", "/man/", "gender=male", "gender=men", "/gentlemen/"];
  const womenPatterns = ["/women/", "/womens/", "/female/", "/her/", "/woman/", "gender=female", "gender=women", "/ladies/"];
  
  for (const pattern of menPatterns) {
    if (lowerUrl.includes(pattern)) return "men";
  }
  
  for (const pattern of womenPatterns) {
    if (lowerUrl.includes(pattern)) return "women";
  }
  
  return "unknown";
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
