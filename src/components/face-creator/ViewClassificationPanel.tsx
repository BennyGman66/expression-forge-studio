import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Play, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { FaceScrapeImage, FaceIdentityImage, FaceJob } from "@/types/face-creator";

interface ViewClassificationPanelProps {
  runId: string | null;
}

interface ImageWithView extends FaceScrapeImage {
  identityImage?: FaceIdentityImage;
}

export function ViewClassificationPanel({ runId }: ViewClassificationPanelProps) {
  const { toast } = useToast();
  const [images, setImages] = useState<ImageWithView[]>([]);
  const [loading, setLoading] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [activeView, setActiveView] = useState<string>("all");
  const [job, setJob] = useState<FaceJob | null>(null);

  useEffect(() => {
    if (runId) {
      fetchImagesWithViews();
      fetchJob();

      const channel = supabase
        .channel('view-classification')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'face_jobs', filter: `scrape_run_id=eq.${runId}` },
          () => fetchJob()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'face_identity_images' },
          () => fetchImagesWithViews()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [runId]);

  const fetchImagesWithViews = async () => {
    if (!runId) return;
    setLoading(true);
    
    // Get identity IDs for this run
    const { data: identities } = await supabase
      .from('face_identities')
      .select('id')
      .eq('scrape_run_id', runId);

    if (!identities || identities.length === 0) {
      setImages([]);
      setLoading(false);
      return;
    }

    // Get identity images
    const { data: identityImages } = await supabase
      .from('face_identity_images')
      .select('*')
      .in('identity_id', identities.map(i => i.id))
      .eq('is_ignored', false);

    if (!identityImages || identityImages.length === 0) {
      setImages([]);
      setLoading(false);
      return;
    }

    // Get the actual images
    const imageIds = identityImages.map(ii => ii.scrape_image_id);
    const { data: imagesData } = await supabase
      .from('face_scrape_images')
      .select('*')
      .in('id', imageIds);

    // Merge
    const identityImageMap = new Map(
      identityImages.map(ii => [ii.scrape_image_id, ii])
    );

    const merged = (imagesData || []).map(img => ({
      ...img,
      identityImage: identityImageMap.get(img.id),
    })) as ImageWithView[];

    setImages(merged);
    setLoading(false);
  };

  const fetchJob = async () => {
    if (!runId) return;
    
    const { data } = await supabase
      .from('face_jobs')
      .select('*')
      .eq('scrape_run_id', runId)
      .eq('type', 'view')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (data) {
      setJob(data as unknown as FaceJob);
      setClassifying(data.status === 'running');
    }
  };

  const handleRunClassification = async () => {
    if (!runId) return;
    setClassifying(true);
    
    try {
      const { error } = await supabase.functions.invoke('classify-face-views', {
        body: { runId },
      });

      if (error) throw error;
      toast({ title: "Started", description: "View classification started" });
    } catch (error) {
      console.error('Error starting classification:', error);
      toast({ title: "Error", description: "Failed to start classification", variant: "destructive" });
      setClassifying(false);
    }
  };

  const handleUpdateView = async (identityImageId: string, view: string) => {
    try {
      const { error } = await supabase
        .from('face_identity_images')
        .update({ view, view_source: 'manual' })
        .eq('id', identityImageId);

      if (error) throw error;
      fetchImagesWithViews();
    } catch (error) {
      console.error('Error updating view:', error);
      toast({ title: "Error", description: "Failed to update view", variant: "destructive" });
    }
  };

  const filteredImages = activeView === "all" 
    ? images 
    : images.filter(img => img.identityImage?.view === activeView);

  const counts = {
    all: images.length,
    front: images.filter(img => img.identityImage?.view === 'front').length,
    side: images.filter(img => img.identityImage?.view === 'side').length,
    back: images.filter(img => img.identityImage?.view === 'back').length,
    unknown: images.filter(img => img.identityImage?.view === 'unknown').length,
  };

  if (!runId) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Select a scrape run from the Scrape tab to classify views
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">View Classification</h2>
          <Badge variant="outline">{images.length} images</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchImagesWithViews}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button 
            onClick={handleRunClassification} 
            disabled={classifying || images.length === 0}
          >
            {classifying ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Classifying...</>
            ) : (
              <><Play className="h-4 w-4 mr-2" /> Run Classification</>
            )}
          </Button>
        </div>
      </div>

      {/* Progress */}
      {job && job.status === 'running' && (
        <Card>
          <CardContent className="py-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Classifying views...</span>
                <span>{job.progress} / {job.total}</span>
              </div>
              <Progress value={(job.progress / Math.max(job.total, 1)) * 100} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter tabs */}
      <Tabs value={activeView} onValueChange={setActiveView}>
        <TabsList>
          <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
          <TabsTrigger value="front">Front ({counts.front})</TabsTrigger>
          <TabsTrigger value="side">Side ({counts.side})</TabsTrigger>
          <TabsTrigger value="back">Back ({counts.back})</TabsTrigger>
          <TabsTrigger value="unknown">Unknown ({counts.unknown})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeView} className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredImages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {images.length === 0 
                ? "Run identity clustering first to classify views"
                : "No images in this category"
              }
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {filteredImages.map((image) => (
                <Card key={image.id} className="overflow-hidden">
                  <div className="aspect-[3/4] relative">
                    <img
                      src={image.stored_url || image.source_url}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <Badge 
                      className="absolute top-2 right-2 text-xs"
                      variant={image.identityImage?.view_source === 'manual' ? 'default' : 'secondary'}
                    >
                      {image.identityImage?.view_source === 'manual' ? '✋' : '🤖'}
                    </Badge>
                  </div>
                  <CardContent className="p-2">
                    {image.identityImage && (
                      <Select
                        value={image.identityImage.view}
                        onValueChange={(value) => handleUpdateView(image.identityImage!.id, value)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="front">Front</SelectItem>
                          <SelectItem value="side">Side</SelectItem>
                          <SelectItem value="back">Back</SelectItem>
                          <SelectItem value="unknown">Unknown</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
