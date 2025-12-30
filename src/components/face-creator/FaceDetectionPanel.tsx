import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Play, RefreshCw, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { FaceScrapeImage, FaceDetection, FaceJob } from "@/types/face-creator";

interface FaceDetectionPanelProps {
  runId: string | null;
}

interface ImageWithDetection extends FaceScrapeImage {
  detection?: FaceDetection;
}

export function FaceDetectionPanel({ runId }: FaceDetectionPanelProps) {
  const { toast } = useToast();
  const [images, setImages] = useState<ImageWithDetection[]>([]);
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [job, setJob] = useState<FaceJob | null>(null);

  useEffect(() => {
    if (runId) {
      fetchImagesWithDetections();
      fetchJob();

      const channel = supabase
        .channel('face-detection')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'face_jobs', filter: `scrape_run_id=eq.${runId}` },
          () => fetchJob()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'face_detections' },
          () => fetchImagesWithDetections()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [runId]);

  const fetchImagesWithDetections = async () => {
    if (!runId) return;
    setLoading(true);
    
    // Fetch images
    const { data: imagesData, error: imagesError } = await supabase
      .from('face_scrape_images')
      .select('*')
      .eq('scrape_run_id', runId)
      .order('created_at', { ascending: true });

    if (imagesError) {
      console.error('Error fetching images:', imagesError);
      setLoading(false);
      return;
    }

    // Fetch detections for these images
    const imageIds = imagesData.map(img => img.id);
    const { data: detectionsData } = await supabase
      .from('face_detections')
      .select('*')
      .in('scrape_image_id', imageIds);

    // Merge detections with images
    const detectionsMap = new Map(
      (detectionsData || []).map(d => [d.scrape_image_id, d])
    );

    const merged = imagesData.map(img => ({
      ...img,
      detection: detectionsMap.get(img.id),
    })) as ImageWithDetection[];

    setImages(merged);
    setLoading(false);
  };

  const fetchJob = async () => {
    if (!runId) return;
    
    const { data } = await supabase
      .from('face_jobs')
      .select('*')
      .eq('scrape_run_id', runId)
      .eq('type', 'face_detection')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (data) {
      setJob(data as unknown as FaceJob);
      setDetecting(data.status === 'running');
    }
  };

  const handleRunDetection = async () => {
    if (!runId) return;
    setDetecting(true);
    
    try {
      const { error } = await supabase.functions.invoke('detect-faces', {
        body: { runId },
      });

      if (error) throw error;
      toast({ title: "Started", description: "Face detection started" });
    } catch (error) {
      console.error('Error starting detection:', error);
      toast({ title: "Error", description: "Failed to start face detection", variant: "destructive" });
      setDetecting(false);
    }
  };

  const getStatusIcon = (detection?: FaceDetection) => {
    if (!detection || detection.status === 'pending') {
      return <Badge variant="secondary" className="text-xs">Pending</Badge>;
    }
    switch (detection.status) {
      case 'detected':
        return <Badge className="bg-green-500 text-xs"><CheckCircle className="h-3 w-3 mr-1" />Face</Badge>;
      case 'no_face':
        return <Badge variant="destructive" className="text-xs"><XCircle className="h-3 w-3 mr-1" />No Face</Badge>;
      case 'multiple_faces':
        return <Badge className="bg-yellow-500 text-xs"><AlertTriangle className="h-3 w-3 mr-1" />Multiple</Badge>;
      default:
        return null;
    }
  };

  const filteredImages = activeFilter === "all" 
    ? images 
    : images.filter(img => {
        if (activeFilter === 'pending') return !img.detection || img.detection.status === 'pending';
        return img.detection?.status === activeFilter;
      });

  const counts = {
    all: images.length,
    detected: images.filter(img => img.detection?.status === 'detected').length,
    no_face: images.filter(img => img.detection?.status === 'no_face').length,
    multiple_faces: images.filter(img => img.detection?.status === 'multiple_faces').length,
    pending: images.filter(img => !img.detection || img.detection.status === 'pending').length,
  };

  if (!runId) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Select a scrape run from the Scrape tab to run face detection
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Face Detection</h2>
          <Badge variant="outline">{images.length} images</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchImagesWithDetections}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button 
            onClick={handleRunDetection} 
            disabled={detecting || images.length === 0}
          >
            {detecting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Detecting...</>
            ) : (
              <><Play className="h-4 w-4 mr-2" /> Run Face Detection</>
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
                <span>Detecting faces...</span>
                <span>{job.progress} / {job.total}</span>
              </div>
              <Progress value={(job.progress / Math.max(job.total, 1)) * 100} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter tabs */}
      <Tabs value={activeFilter} onValueChange={setActiveFilter}>
        <TabsList>
          <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
          <TabsTrigger value="detected">Detected ({counts.detected})</TabsTrigger>
          <TabsTrigger value="no_face">No Face ({counts.no_face})</TabsTrigger>
          <TabsTrigger value="multiple_faces">Multiple ({counts.multiple_faces})</TabsTrigger>
          <TabsTrigger value="pending">Pending ({counts.pending})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeFilter} className="mt-4">
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
                    <div className="absolute top-2 right-2">
                      {getStatusIcon(image.detection)}
                    </div>
                    {image.detection?.face_count && image.detection.face_count > 1 && (
                      <Badge className="absolute bottom-2 left-2 text-xs">
                        {image.detection.face_count} faces
                      </Badge>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
