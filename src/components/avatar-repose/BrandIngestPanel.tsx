import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, RefreshCw, Trash2, Globe, Image as ImageIcon, Square, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { Brand, ScrapeJob, Product } from "@/types/avatar-repose";

export function BrandIngestPanel() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [jobs, setJobs] = useState<Record<string, ScrapeJob>>({});
  const [products, setProducts] = useState<Record<string, Product[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [scrapingBrandId, setScrapingBrandId] = useState<string | null>(null);
  const shouldStopRef = useRef(false);

  // Form state
  const [brandName, setBrandName] = useState("");
  const [startUrl, setStartUrl] = useState("");
  const [scrapeLimit, setScrapeLimit] = useState(200);

  // Fetch brands
  useEffect(() => {
    fetchBrands();

    // Subscribe to job updates
    const channel = supabase
      .channel("scrape-jobs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scrape_jobs" },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const job = payload.new as ScrapeJob;
            setJobs((prev) => ({ ...prev, [job.brand_id]: job }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchBrands = async () => {
    const { data: brandsData } = await supabase
      .from("brands")
      .select("*")
      .order("created_at", { ascending: false });

    if (brandsData) {
      setBrands(brandsData);

      // Fetch latest job for each brand
      for (const brand of brandsData) {
        const { data: jobData } = await supabase
          .from("scrape_jobs")
          .select("*")
          .eq("brand_id", brand.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (jobData) {
          setJobs((prev) => ({ ...prev, [brand.id]: jobData }));
        }

        // Fetch products for this brand
        const { data: productsData } = await supabase
          .from("products")
          .select("*")
          .eq("brand_id", brand.id);

        if (productsData) {
          setProducts((prev) => ({ ...prev, [brand.id]: productsData }));
        }
      }
    }
  };

  const handleStartScrape = async () => {
    if (!brandName.trim() || !startUrl.trim()) {
      toast.error("Please enter brand name and URL");
      return;
    }

    setIsLoading(true);
    shouldStopRef.current = false;

    try {
      // Create brand
      const { data: brand, error: brandError } = await supabase
        .from("brands")
        .insert({ name: brandName, start_url: startUrl })
        .select()
        .single();

      if (brandError) throw brandError;

      toast.success(`Created brand: ${brandName}`);
      setBrandName("");
      setStartUrl("");
      fetchBrands();

      // Start the scraping process
      await runClientSideScrape(brand.id, startUrl, scrapeLimit);
    } catch (err) {
      console.error("Scrape error:", err);
      toast.error("Failed to start scrape");
    } finally {
      setIsLoading(false);
    }
  };

  const runClientSideScrape = async (brandId: string, startUrl: string, limit: number) => {
    setScrapingBrandId(brandId);
    shouldStopRef.current = false;

    try {
      // Step 1: Get product URLs from scrape-brand
      toast.info("Mapping website for products...");
      
      const { data: mapResult, error: mapError } = await supabase.functions.invoke("scrape-brand", {
        body: { brandId, startUrl, limit },
      });

      if (mapError || !mapResult?.success) {
        throw new Error(mapResult?.error || mapError?.message || "Failed to map website");
      }

      const { jobId, productUrls } = mapResult;
      
      if (!productUrls || productUrls.length === 0) {
        toast.warning("No products found on website");
        await supabase.from("scrape_jobs").update({ status: "completed" }).eq("id", jobId);
        setScrapingBrandId(null);
        return;
      }

      toast.success(`Found ${productUrls.length} products to scrape`);

      // Update job to running
      await supabase.from("scrape_jobs").update({ status: "running" }).eq("id", jobId);

      // Step 2: Process products using shared loop
      await processProductUrls(brandId, jobId, productUrls, 0);
    } catch (err) {
      console.error("Client-side scrape error:", err);
      toast.error(err instanceof Error ? err.message : "Scraping failed");
    } finally {
      setScrapingBrandId(null);
    }
  };

  const processProductUrls = async (
    brandId: string, 
    jobId: string, 
    productUrls: string[], 
    startIndex: number
  ) => {
    let processed = startIndex;
    let successCount = 0;
    let failCount = 0;

    for (let i = startIndex; i < productUrls.length; i++) {
      if (shouldStopRef.current) {
        toast.info("Scraping stopped by user");
        await supabase.from("scrape_jobs").update({ 
          status: "stopped",
          current_index: i 
        }).eq("id", jobId);
        return;
      }

      const productUrl = productUrls[i];

      try {
        const { data, error } = await supabase.functions.invoke("scrape-product-single", {
          body: { brandId, productUrl, jobId },
        });

        if (error) {
          console.error(`Error scraping ${productUrl}:`, error);
          failCount++;
        } else if (data?.success && !data?.skipped) {
          successCount++;
        } else if (data?.skipped) {
          // Skipped is okay, just no images found
        } else {
          failCount++;
        }
      } catch (err) {
        console.error(`Failed to process ${productUrl}:`, err);
        failCount++;
      }

      processed++;
      
      // Update progress and current_index
      await supabase.from("scrape_jobs").update({ 
        progress: processed,
        current_index: i + 1,
        updated_at: new Date().toISOString()
      }).eq("id", jobId);

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    // Mark job as complete
    if (!shouldStopRef.current) {
      await supabase.from("scrape_jobs").update({ status: "completed" }).eq("id", jobId);
      
      if (failCount === 0) {
        toast.success(`Scraping complete! ${successCount} products saved.`);
      } else if (successCount === 0) {
        toast.error(`All ${failCount} products failed to scrape.`);
      } else {
        toast.warning(`Scraped ${successCount} products, ${failCount} failed.`);
      }
    }

    // Refresh products
    fetchBrands();
  };

  const handleStopScrape = () => {
    shouldStopRef.current = true;
    toast.info("Stopping scrape...");
  };

  const handleResumeScrape = async (brand: Brand, job: ScrapeJob) => {
    // Check if job has stored product URLs
    const jobWithUrls = job as ScrapeJob & { product_urls?: string[]; current_index?: number };
    
    if (!jobWithUrls.product_urls || jobWithUrls.product_urls.length === 0) {
      toast.info("No saved URLs - restarting scrape");
      await runClientSideScrape(brand.id, brand.start_url, scrapeLimit);
      return;
    }

    const startIndex = jobWithUrls.current_index || job.progress || 0;
    const remaining = jobWithUrls.product_urls.length - startIndex;
    
    toast.info(`Resuming from product ${startIndex + 1}/${jobWithUrls.product_urls.length} (${remaining} remaining)`);
    
    setScrapingBrandId(brand.id);
    shouldStopRef.current = false;

    try {
      // Update job status to running
      await supabase.from("scrape_jobs").update({ status: "running" }).eq("id", job.id);
      
      // Continue processing from where we left off
      await processProductUrls(brand.id, job.id, jobWithUrls.product_urls, startIndex);
    } catch (err) {
      console.error("Resume error:", err);
      toast.error("Failed to resume scraping");
    } finally {
      setScrapingBrandId(null);
    }
  };

  const handleDeleteBrand = async (brandId: string) => {
    try {
      await supabase.from("brands").delete().eq("id", brandId);
      setBrands((prev) => prev.filter((b) => b.id !== brandId));
      toast.success("Brand deleted");
    } catch (err) {
      toast.error("Failed to delete brand");
    }
  };

  const getGenderBreakdown = (brandProducts: Product[]) => {
    const men = brandProducts.filter((p) => p.gender === "men").length;
    const women = brandProducts.filter((p) => p.gender === "women").length;
    const other = brandProducts.length - men - women;
    return { men, women, other };
  };

  const isJobStalled = (job: ScrapeJob) => {
    if (job.status !== "running") return false;
    const updatedAt = new Date(job.updated_at).getTime();
    const now = Date.now();
    return (now - updatedAt) > 5 * 60 * 1000; // 5 minutes
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Add Brand Form */}
      <Card className="p-6">
        <h3 className="text-lg font-medium mb-4">Add New Brand</h3>
        <div className="grid md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Brand Name</Label>
            <Input
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="e.g. Zara"
              disabled={isLoading || scrapingBrandId !== null}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Starting URL</Label>
            <Input
              type="url"
              value={startUrl}
              onChange={(e) => setStartUrl(e.target.value)}
              placeholder="https://www.brand.com/collections/all"
              disabled={isLoading || scrapingBrandId !== null}
            />
          </div>
          <div className="space-y-2">
            <Label>Product Limit</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                value={scrapeLimit}
                onChange={(e) => setScrapeLimit(Number(e.target.value))}
                min={1}
                max={500}
                disabled={isLoading || scrapingBrandId !== null}
              />
              <Button onClick={handleStartScrape} disabled={isLoading || scrapingBrandId !== null}>
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Brand List */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Brands</h3>
        {brands.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <Globe className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No brands added yet</p>
            <p className="text-sm">Add a brand URL above to start scraping</p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {brands.map((brand) => {
              const job = jobs[brand.id];
              const brandProducts = products[brand.id] || [];
              const breakdown = getGenderBreakdown(brandProducts);
              const isCurrentlyScraping = scrapingBrandId === brand.id;
              const stalled = job && isJobStalled(job);

              return (
                <Card key={brand.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h4 className="font-medium">{brand.name}</h4>
                        {job && (
                          <Badge
                            variant={
                              job.status === "completed"
                                ? "default"
                                : job.status === "running"
                                ? stalled ? "destructive" : "secondary"
                                : job.status === "failed" || job.status === "stalled"
                                ? "destructive"
                                : job.status === "stopped"
                                ? "outline"
                                : "outline"
                            }
                          >
                            {stalled ? "stalled" : job.status}
                          </Badge>
                        )}
                        {isCurrentlyScraping && (
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate max-w-lg">
                        {brand.start_url}
                      </p>

                      {/* Progress */}
                      {job && (job.status === "running" || isCurrentlyScraping) && (
                        <div className="mt-3">
                          <Progress
                            value={(job.progress / (job.total || 1)) * 100}
                            className="h-2"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            {job.progress} / {job.total} products
                          </p>
                        </div>
                      )}

                      {/* Stats */}
                      {brandProducts.length > 0 && (
                        <div className="flex gap-4 mt-3 text-sm">
                          <span className="flex items-center gap-1">
                            <ImageIcon className="w-4 h-4" />
                            {brandProducts.length} products
                          </span>
                          <span>Men: {breakdown.men}</span>
                          <span>Women: {breakdown.women}</span>
                          {breakdown.other > 0 && <span>Other: {breakdown.other}</span>}
                        </div>
                      )}

                      {/* Logs */}
                      {job && Array.isArray(job.logs) && job.logs.length > 0 && (
                        <div className="mt-3 max-h-20 overflow-y-auto text-xs font-mono text-muted-foreground bg-muted/50 rounded p-2">
                          {(job.logs as Array<{ time?: string; message?: string } | string>).slice(-5).map((log, i) => (
                            <div key={i}>
                              {typeof log === 'string' ? log : log?.message || JSON.stringify(log)}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      {isCurrentlyScraping ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={handleStopScrape}
                        >
                          <Square className="w-4 h-4 mr-1" />
                          Stop
                        </Button>
                      ) : (stalled || job?.status === "stopped" || job?.status === "stalled") ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleResumeScrape(brand, job)}
                        >
                          <RotateCcw className="w-4 h-4 mr-1" />
                          Resume
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => fetchBrands()}
                      >
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteBrand(brand.id)}
                        disabled={isCurrentlyScraping}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
