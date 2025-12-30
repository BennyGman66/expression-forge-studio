import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Play, RefreshCw, Trash2, CheckCircle, XCircle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { FaceScrapeRun } from "@/types/face-creator";

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
  const [maxProducts, setMaxProducts] = useState(200);
  const [imagesPerProduct, setImagesPerProduct] = useState(4);

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
          maxProducts,
          imagesPerProduct,
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
        return <Badge variant="default" className="bg-blue-500"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Running</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  return (
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
              placeholder="https://brand.com/collections/models"
              value={startUrl}
              onChange={(e) => setStartUrl(e.target.value)}
            />
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
                onChange={(e) => setMaxProducts(Number(e.target.value))}
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
                onChange={(e) => setImagesPerProduct(Number(e.target.value))}
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
          <ScrollArea className="h-[400px]">
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

                    {run.status === 'running' && (
                      <div className="space-y-1">
                        <Progress value={(run.progress / Math.max(run.total, 1)) * 100} />
                        <p className="text-xs text-muted-foreground">
                          {run.progress} / {run.total} images
                        </p>
                      </div>
                    )}

                    {run.status === 'completed' && (
                      <p className="text-sm text-muted-foreground">
                        {run.total} images scraped
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
  );
}
