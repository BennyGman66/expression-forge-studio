import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Play, RefreshCw, Trash2, CheckCircle, XCircle, Clock, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { FaceScrapeRun, FaceScrapeImage } from "@/types/face-creator";

interface ScrapePanelProps {
  selectedRunId: string | null;
  onSelectRun: (runId: string | null) => void;
}

export function ScrapePanel({ selectedRunId, onSelectRun }: ScrapePanelProps) {
  const { toast } = useToast();
  const [runs, setRuns] = useState<FaceScrapeRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [startUrl, setStartUrl] = useState("");
  const [brandName, setBrandName] = useState("");
  const [maxProducts, setMaxProducts] = useState("200");
  const [imagesPerProduct, setImagesPerProduct] = useState("4");
  
  // Image preview state
  const [previewImages, setPreviewImages] = useState<FaceScrapeImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [imageStats, setImageStats] = useState<{ men: number; women: number; unknown: number } | null>(null);

  useEffect(() => {
    fetchRuns();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('face-scrape-runs')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'face_scrape_runs' },
        () => fetchRuns()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Fetch images when a run is selected
  useEffect(() => {
    if (selectedRunId) {
      fetchPreviewImages(selectedRunId);
    } else {
      setPreviewImages([]);
      setImageStats(null);
    }
  }, [selectedRunId]);

  const fetchRuns = async () => {
    const { data, error } = await supabase
      .from('face_scrape_runs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching runs:', error);
      return;
    }

    setRuns(data as unknown as FaceScrapeRun[]);
  };

  const fetchPreviewImages = async (runId: string) => {
    setLoadingImages(true);
    try {
      const { data, error } = await supabase
        .from('face_scrape_images')
        .select('*')
        .eq('scrape_run_id', runId)
        .order('created_at', { ascending: true })
        .limit(50);

      if (error) throw error;

      setPreviewImages(data as unknown as FaceScrapeImage[]);

      // Get stats
      const { data: statsData } = await supabase
        .from('face_scrape_images')
        .select('gender')
        .eq('scrape_run_id', runId);

      if (statsData) {
        const stats = { men: 0, women: 0, unknown: 0 };
        statsData.forEach((img: { gender: string }) => {
          if (img.gender === 'men') stats.men++;
          else if (img.gender === 'women') stats.women++;
          else stats.unknown++;
        });
        setImageStats(stats);
      }
    } catch (error) {
      console.error('Error fetching images:', error);
    } finally {
      setLoadingImages(false);
    }
  };

  const handleStartScrape = async () => {
    if (!startUrl) {
      toast({ title: "Error", description: "Please enter a start URL", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('scrape-faces', {
        body: {
          startUrl,
          brandName: brandName || new URL(startUrl).hostname.replace('www.', ''),
          maxProducts: parseInt(maxProducts) || 200,
          imagesPerProduct: parseInt(imagesPerProduct) || 4,
        },
      });

      if (error) throw error;

      toast({ title: "Success", description: "Scrape job started" });
      setStartUrl("");
      setBrandName("");
      if (data?.runId) {
        onSelectRun(data.runId);
      }
    } catch (error) {
      console.error('Error starting scrape:', error);
      toast({ title: "Error", description: "Failed to start scrape", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRun = async (runId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // Delete images first
      await supabase
        .from('face_scrape_images')
        .delete()
        .eq('scrape_run_id', runId);

      const { error } = await supabase
        .from('face_scrape_runs')
        .delete()
        .eq('id', runId);

      if (error) throw error;

      if (selectedRunId === runId) {
        onSelectRun(null);
      }
      toast({ title: "Deleted", description: "Scrape run deleted" });
    } catch (error) {
      console.error('Error deleting run:', error);
      toast({ title: "Error", description: "Failed to delete run", variant: "destructive" });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      case 'running':
        return <Badge variant="default" className="bg-blue-500"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Scraping</Badge>;
      case 'mapping':
        return <Badge variant="default" className="bg-yellow-500"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Mapping</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  const selectedRun = runs.find(r => r.id === selectedRunId);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: New Scrape Form */}
        <Card>
          <CardHeader>
            <CardTitle>New Scrape</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="startUrl">Start URL *</Label>
              <Input
                id="startUrl"
                placeholder="https://brand.com/women/clothing"
                value={startUrl}
                onChange={(e) => setStartUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Use a category page URL (e.g., /women/tops) to focus the scrape on that section
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="brandName">Brand Name (optional)</Label>
              <Input
                id="brandName"
                placeholder="Brand Name"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="maxProducts">Max Products</Label>
                <Input
                  id="maxProducts"
                  type="number"
                  min={1}
                  max={1000}
                  value={maxProducts}
                  onChange={(e) => setMaxProducts(e.target.value)}
                  onBlur={(e) => {
                    const num = parseInt(e.target.value);
                    if (isNaN(num) || num < 1) {
                      setMaxProducts("200");
                    } else if (num > 1000) {
                      setMaxProducts("1000");
                    } else {
                      setMaxProducts(String(num));
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="imagesPerProduct">Images per Product</Label>
                <Input
                  id="imagesPerProduct"
                  type="number"
                  min={1}
                  max={20}
                  value={imagesPerProduct}
                  onChange={(e) => setImagesPerProduct(e.target.value)}
                  onBlur={(e) => {
                    const num = parseInt(e.target.value);
                    if (isNaN(num) || num < 1) {
                      setImagesPerProduct("4");
                    } else if (num > 20) {
                      setImagesPerProduct("20");
                    } else {
                      setImagesPerProduct(String(num));
                    }
                  }}
                />
              </div>
            </div>

            <Button 
              onClick={handleStartScrape} 
              disabled={loading || !startUrl}
              className="w-full"
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Starting...</>
              ) : (
                <><Play className="h-4 w-4 mr-2" /> Run Scrape</>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Right: Previous Runs */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Previous Runs</CardTitle>
            <Button variant="ghost" size="sm" onClick={fetchRuns}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              {runs.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No scrape runs yet</p>
              ) : (
                <div className="space-y-3">
                  {runs.map((run) => (
                    <div
                      key={run.id}
                      onClick={() => onSelectRun(run.id)}
                      className={`p-4 border rounded-lg cursor-pointer transition-colors hover:bg-muted/50 ${
                        selectedRunId === run.id ? 'border-primary bg-muted/30' : 'border-border'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-medium">{run.brand_name}</h4>
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {run.start_url}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(run.status)}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => handleDeleteRun(run.id, e)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>

                      {(run.status === 'running' || run.status === 'mapping') && (
                        <div className="space-y-1 mt-2">
                          <Progress value={run.total > 0 ? (run.progress / run.total) * 100 : 0} className="h-2" />
                          <p className="text-xs text-muted-foreground">
                            {run.status === 'mapping' 
                              ? 'Mapping website for products...' 
                              : `${run.progress} / ${run.total} products scraped`}
                          </p>
                        </div>
                      )}

                      {run.status === 'completed' && (
                        <p className="text-sm text-muted-foreground">
                          {run.progress} products processed
                        </p>
                      )}

                      <p className="text-xs text-muted-foreground mt-2">
                        {new Date(run.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Image Preview Section */}
      {selectedRunId && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                Scraped Images {selectedRun && `- ${selectedRun.brand_name}`}
              </CardTitle>
              {imageStats && (
                <div className="flex gap-2">
                  <Badge variant="secondary">Men: {imageStats.men}</Badge>
                  <Badge variant="secondary">Women: {imageStats.women}</Badge>
                  <Badge variant="outline">Unknown: {imageStats.unknown}</Badge>
                  <Badge>Total: {imageStats.men + imageStats.women + imageStats.unknown}</Badge>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loadingImages ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : previewImages.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No images scraped yet</p>
                {selectedRun?.status === 'running' && (
                  <p className="text-sm mt-1">Images will appear as scraping progresses...</p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Showing first {previewImages.length} images. Click on an image to view source.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {previewImages.map((image) => (
                    <a
                      key={image.id}
                      href={image.product_url || image.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative aspect-[3/4] bg-muted rounded-lg overflow-hidden border hover:border-primary transition-colors"
                    >
                      <img
                        src={image.source_url}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/placeholder.svg';
                        }}
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors" />
                      <Badge 
                        className="absolute top-1 right-1 text-[10px]"
                        variant={image.gender === 'women' ? 'default' : image.gender === 'men' ? 'secondary' : 'outline'}
                      >
                        {image.gender}
                      </Badge>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
