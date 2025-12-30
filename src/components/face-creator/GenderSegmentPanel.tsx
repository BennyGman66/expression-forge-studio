import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Play, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { FaceScrapeImage, FaceJob } from "@/types/face-creator";

interface GenderSegmentPanelProps {
  runId: string | null;
}

export function GenderSegmentPanel({ runId }: GenderSegmentPanelProps) {
  const { toast } = useToast();
  const [images, setImages] = useState<FaceScrapeImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [activeGender, setActiveGender] = useState<string>("all");
  const [job, setJob] = useState<FaceJob | null>(null);

  useEffect(() => {
    if (runId) {
      fetchImages();
      fetchJob();

      const channel = supabase
        .channel('gender-job')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'face_jobs', filter: `scrape_run_id=eq.${runId}` },
          () => fetchJob()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'face_scrape_images', filter: `scrape_run_id=eq.${runId}` },
          () => fetchImages()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [runId]);

  const fetchImages = async () => {
    if (!runId) return;
    setLoading(true);
    
    const { data, error } = await supabase
      .from('face_scrape_images')
      .select('*')
      .eq('scrape_run_id', runId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching images:', error);
    } else {
      setImages(data as unknown as FaceScrapeImage[]);
    }
    setLoading(false);
  };

  const fetchJob = async () => {
    if (!runId) return;
    
    const { data } = await supabase
      .from('face_jobs')
      .select('*')
      .eq('scrape_run_id', runId)
      .eq('type', 'gender')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (data) {
      setJob(data as unknown as FaceJob);
      setClassifying(data.status === 'running');
    }
  };

  const handleClassifyGender = async () => {
    if (!runId) return;
    setClassifying(true);
    
    try {
      const { error } = await supabase.functions.invoke('classify-face-gender', {
        body: { runId },
      });

      if (error) throw error;
      toast({ title: "Started", description: "Gender classification started" });
    } catch (error) {
      console.error('Error starting classification:', error);
      toast({ title: "Error", description: "Failed to start classification", variant: "destructive" });
      setClassifying(false);
    }
  };

  const handleUpdateGender = async (imageId: string, gender: string) => {
    try {
      const { error } = await supabase
        .from('face_scrape_images')
        .update({ gender, gender_source: 'manual' })
        .eq('id', imageId);

      if (error) throw error;
      fetchImages();
    } catch (error) {
      console.error('Error updating gender:', error);
      toast({ title: "Error", description: "Failed to update gender", variant: "destructive" });
    }
  };

  const filteredImages = activeGender === "all" 
    ? images 
    : images.filter(img => img.gender === activeGender);

  const counts = {
    all: images.length,
    men: images.filter(img => img.gender === 'men').length,
    women: images.filter(img => img.gender === 'women').length,
    unknown: images.filter(img => img.gender === 'unknown').length,
  };

  if (!runId) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Select a scrape run from the Scrape tab to view gender segmentation
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Gender Segmentation</h2>
          <Badge variant="outline">{images.length} images</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchImages}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button 
            onClick={handleClassifyGender} 
            disabled={classifying || images.length === 0}
          >
            {classifying ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Classifying...</>
            ) : (
              <><Play className="h-4 w-4 mr-2" /> Run AI Classification</>
            )}
          </Button>
        </div>
      </div>

      {/* Progress bar if job is running */}
      {job && job.status === 'running' && (
        <Card>
          <CardContent className="py-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Classifying genders...</span>
                <span>{job.progress} / {job.total}</span>
              </div>
              <Progress value={(job.progress / Math.max(job.total, 1)) * 100} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter tabs */}
      <Tabs value={activeGender} onValueChange={setActiveGender}>
        <TabsList>
          <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
          <TabsTrigger value="men">Men ({counts.men})</TabsTrigger>
          <TabsTrigger value="women">Women ({counts.women})</TabsTrigger>
          <TabsTrigger value="unknown">Unknown ({counts.unknown})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeGender} className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredImages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No images in this category
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
                      variant={image.gender_source === 'manual' ? 'default' : 'secondary'}
                    >
                      {image.gender_source === 'ai' ? '🤖' : image.gender_source === 'manual' ? '✋' : '🔗'}
                    </Badge>
                  </div>
                  <CardContent className="p-2">
                    <Select
                      value={image.gender}
                      onValueChange={(value) => handleUpdateGender(image.id, value)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="men">Men</SelectItem>
                        <SelectItem value="women">Women</SelectItem>
                        <SelectItem value="unknown">Unknown</SelectItem>
                      </SelectContent>
                    </Select>
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
