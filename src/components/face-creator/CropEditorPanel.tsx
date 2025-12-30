import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2, Play, RefreshCw, ChevronLeft, ChevronRight, RotateCcw, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { FaceScrapeImage, FaceCrop, FaceJob } from "@/types/face-creator";

interface CropEditorPanelProps {
  runId: string | null;
}

interface ImageWithCrop extends FaceScrapeImage {
  crop?: FaceCrop;
}

export function CropEditorPanel({ runId }: CropEditorPanelProps) {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [images, setImages] = useState<ImageWithCrop[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [job, setJob] = useState<FaceJob | null>(null);
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '4:5'>('1:1');
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, width: 200, height: 200 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const selectedImage = images[selectedIndex];

  useEffect(() => {
    if (runId) {
      fetchImagesWithCrops();
      fetchJob();

      const channel = supabase
        .channel('crop-editor')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'face_jobs', filter: `scrape_run_id=eq.${runId}` },
          () => fetchJob()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'face_crops' },
          () => fetchImagesWithCrops()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [runId]);

  useEffect(() => {
    if (selectedImage?.crop) {
      setCropRect({
        x: selectedImage.crop.crop_x,
        y: selectedImage.crop.crop_y,
        width: selectedImage.crop.crop_width,
        height: selectedImage.crop.crop_height,
      });
      setAspectRatio(selectedImage.crop.aspect_ratio);
    }
  }, [selectedImage]);

  const fetchImagesWithCrops = async () => {
    if (!runId) return;
    setLoading(true);
    
    const { data: imagesData } = await supabase
      .from('face_scrape_images')
      .select('*')
      .eq('scrape_run_id', runId)
      .order('created_at', { ascending: true });

    if (!imagesData) {
      setLoading(false);
      return;
    }

    const imageIds = imagesData.map(img => img.id);
    const { data: cropsData } = await supabase
      .from('face_crops')
      .select('*')
      .in('scrape_image_id', imageIds);

    const cropsMap = new Map(
      (cropsData || []).map(c => [c.scrape_image_id, c])
    );

    const merged = imagesData.map(img => ({
      ...img,
      crop: cropsMap.get(img.id),
    })) as ImageWithCrop[];

    setImages(merged);
    setLoading(false);
  };

  const fetchJob = async () => {
    if (!runId) return;
    
    const { data } = await supabase
      .from('face_jobs')
      .select('*')
      .eq('scrape_run_id', runId)
      .eq('type', 'crop')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (data) {
      setJob(data as unknown as FaceJob);
      setGenerating(data.status === 'running');
    }
  };

  const handleGenerateCrops = async () => {
    if (!runId) return;
    setGenerating(true);
    
    try {
      const { error } = await supabase.functions.invoke('generate-face-crops', {
        body: { runId, aspectRatio },
      });

      if (error) throw error;
      toast({ title: "Started", description: "Crop generation started" });
    } catch (error) {
      console.error('Error generating crops:', error);
      toast({ title: "Error", description: "Failed to start crop generation", variant: "destructive" });
      setGenerating(false);
    }
  };

  const handleSaveCrop = async () => {
    if (!selectedImage) return;
    
    try {
      if (selectedImage.crop) {
        const { error } = await supabase
          .from('face_crops')
          .update({
            crop_x: cropRect.x,
            crop_y: cropRect.y,
            crop_width: cropRect.width,
            crop_height: cropRect.height,
            aspect_ratio: aspectRatio,
            is_auto: false,
          })
          .eq('id', selectedImage.crop.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('face_crops')
          .insert({
            scrape_image_id: selectedImage.id,
            crop_x: cropRect.x,
            crop_y: cropRect.y,
            crop_width: cropRect.width,
            crop_height: cropRect.height,
            aspect_ratio: aspectRatio,
            is_auto: false,
          });

        if (error) throw error;
      }

      toast({ title: "Saved", description: "Crop saved" });
      fetchImagesWithCrops();
    } catch (error) {
      console.error('Error saving crop:', error);
      toast({ title: "Error", description: "Failed to save crop", variant: "destructive" });
    }
  };

  const handleResetCrop = () => {
    if (selectedImage?.crop) {
      setCropRect({
        x: selectedImage.crop.crop_x,
        y: selectedImage.crop.crop_y,
        width: selectedImage.crop.crop_width,
        height: selectedImage.crop.crop_height,
      });
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setIsDragging(true);
    setDragStart({
      x: e.clientX - rect.left - cropRect.x,
      y: e.clientY - rect.top - cropRect.y,
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const newX = Math.max(0, Math.min(e.clientX - rect.left - dragStart.x, rect.width - cropRect.width));
    const newY = Math.max(0, Math.min(e.clientY - rect.top - dragStart.y, rect.height - cropRect.height));
    setCropRect(prev => ({ ...prev, x: newX, y: newY }));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const croppedCount = images.filter(img => img.crop).length;

  if (!runId) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Select a scrape run from the Scrape tab to edit crops
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Crop Editor</h2>
          <Badge variant="outline">{croppedCount} / {images.length} cropped</Badge>
        </div>
        <div className="flex items-center gap-4">
          <RadioGroup 
            value={aspectRatio} 
            onValueChange={(v) => setAspectRatio(v as '1:1' | '4:5')}
            className="flex gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="1:1" id="ratio-1-1" />
              <Label htmlFor="ratio-1-1">1:1</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="4:5" id="ratio-4-5" />
              <Label htmlFor="ratio-4-5">4:5</Label>
            </div>
          </RadioGroup>
          <Button variant="outline" size="sm" onClick={fetchImagesWithCrops}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button 
            onClick={handleGenerateCrops} 
            disabled={generating || images.length === 0}
          >
            {generating ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
            ) : (
              <><Play className="h-4 w-4 mr-2" /> Auto-Generate Crops</>
            )}
          </Button>
        </div>
      </div>

      {/* Job Status Bar */}
      {job && (
        <Card className={`border-l-4 ${
          job.status === 'running' ? 'border-l-blue-500' :
          job.status === 'completed' ? 'border-l-green-500' :
          job.status === 'failed' ? 'border-l-destructive' :
          'border-l-muted-foreground'
        }`}>
          <CardContent className="py-4">
            <div className="space-y-3">
              {/* Status header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {job.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                  {job.status === 'completed' && <Check className="h-4 w-4 text-green-500" />}
                  {job.status === 'failed' && <span className="h-4 w-4 text-destructive">✕</span>}
                  {job.status === 'pending' && <span className="h-4 w-4 text-muted-foreground">⏳</span>}
                  <span className="font-medium">
                    {job.status === 'running' ? 'Generating Crops...' :
                     job.status === 'completed' ? 'Crop Generation Complete' :
                     job.status === 'failed' ? 'Crop Generation Failed' :
                     'Pending'}
                  </span>
                </div>
                <Badge variant={
                  job.status === 'running' ? 'default' :
                  job.status === 'completed' ? 'secondary' :
                  job.status === 'failed' ? 'destructive' :
                  'outline'
                }>
                  {job.progress} / {job.total}
                </Badge>
              </div>
              
              {/* Progress bar */}
              {(job.status === 'running' || job.status === 'completed') && (
                <Progress 
                  value={(job.progress / Math.max(job.total, 1)) * 100} 
                  className={job.status === 'completed' ? '[&>div]:bg-green-500' : ''}
                />
              )}
              
              {/* Latest log message */}
              {job.logs && job.logs.length > 0 && (
                <p className="text-xs text-muted-foreground truncate">
                  {job.logs[job.logs.length - 1]?.message}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main editor */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Image list */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Images</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {images.map((image, index) => (
                    <div
                      key={image.id}
                      onClick={() => setSelectedIndex(index)}
                      className={`aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-colors ${
                        selectedIndex === index 
                          ? 'border-primary' 
                          : 'border-transparent hover:border-muted-foreground/50'
                      }`}
                    >
                      <div className="relative w-full h-full">
                        <img
                          src={image.stored_url || image.source_url}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        {image.crop && (
                          <Badge className="absolute top-1 right-1 text-[10px] px-1 bg-green-500">
                            ✓
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Crop editor */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Original Image</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedImage ? (
              <div 
                className="relative bg-muted rounded-lg overflow-hidden cursor-move"
                style={{ aspectRatio: '3/4' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <img
                  src={selectedImage.stored_url || selectedImage.source_url}
                  alt=""
                  className="w-full h-full object-contain"
                />
                {/* Crop overlay */}
                <div 
                  className="absolute border-2 border-primary bg-primary/20"
                  style={{
                    left: cropRect.x,
                    top: cropRect.y,
                    width: cropRect.width,
                    height: cropRect.height,
                  }}
                />
              </div>
            ) : (
              <div className="aspect-[3/4] bg-muted rounded-lg flex items-center justify-center text-muted-foreground">
                No image selected
              </div>
            )}
          </CardContent>
        </Card>

        {/* Crop preview and controls */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Cropped Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedImage ? (
              <>
                <div 
                  className="bg-muted rounded-lg overflow-hidden"
                  style={{ aspectRatio: aspectRatio === '1:1' ? '1/1' : '4/5' }}
                >
                  {selectedImage.crop?.cropped_stored_url ? (
                    <img
                      src={selectedImage.crop.cropped_stored_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                      No crop generated
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1"
                    onClick={handleResetCrop}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset
                  </Button>
                  <Button 
                    size="sm" 
                    className="flex-1"
                    onClick={handleSaveCrop}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Apply
                  </Button>
                </div>

                <div className="flex justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={selectedIndex === 0}
                    onClick={() => setSelectedIndex(i => i - 1)}
                  >
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={selectedIndex === images.length - 1}
                    onClick={() => setSelectedIndex(i => i + 1)}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                Select an image to edit
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
