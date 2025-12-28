import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, RefreshCw, Trash2, Globe, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import type { Brand, ScrapeJob, Product } from "@/types/avatar-repose";

export function BrandIngestPanel() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [jobs, setJobs] = useState<Record<string, ScrapeJob>>({});
  const [products, setProducts] = useState<Record<string, Product[]>>({});
  const [isLoading, setIsLoading] = useState(false);

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
          .single();

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

    try {
      // Create brand
      const { data: brand, error: brandError } = await supabase
        .from("brands")
        .insert({ name: brandName, start_url: startUrl })
        .select()
        .single();

      if (brandError) throw brandError;

      // Start scrape job
      const { data, error } = await supabase.functions.invoke("scrape-brand", {
        body: {
          brandId: brand.id,
          startUrl,
          limit: scrapeLimit,
        },
      });

      if (error) throw error;

      toast.success(`Started scraping ${brandName}`);
      setBrandName("");
      setStartUrl("");
      fetchBrands();
    } catch (err) {
      console.error("Scrape error:", err);
      toast.error("Failed to start scrape");
    } finally {
      setIsLoading(false);
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
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Starting URL</Label>
            <Input
              type="url"
              value={startUrl}
              onChange={(e) => setStartUrl(e.target.value)}
              placeholder="https://www.brand.com/collections/all"
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
              />
              <Button onClick={handleStartScrape} disabled={isLoading}>
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
                                ? "secondary"
                                : job.status === "failed"
                                ? "destructive"
                                : "outline"
                            }
                          >
                            {job.status}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate max-w-lg">
                        {brand.start_url}
                      </p>

                      {/* Progress */}
                      {job && job.status === "running" && (
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
