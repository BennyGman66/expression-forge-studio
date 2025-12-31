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
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [images, setImages] = useState<ImageWithCrop[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [job, setJob] = useState<FaceJob | null>(null);
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '4:5'>('1:1');
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, width: 200, height: 200 });
  const [interactionMode, setInteractionMode] = useState<'none' | 'move' | 'nw' | 'ne' | 'sw' | 'se'>('none');
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [startCrop, setStartCrop] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });
  const [imageBounds, setImageBounds] = useState({ offsetX: 0, offsetY: 0, width: 0, height: 0 });

  const selectedImage = images[selectedIndex];

  useEffect(() => {
    if (!runId) return;
    
    fetchImagesWithCrops();
    fetchJob();

    const channel = supabase
      .channel('crop-editor')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'face_jobs' },
        (payload) => {
          if ((payload.new as any)?.scrape_run_id === runId) {
            fetchJob();
          }
        }
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
  }, [runId]);

  // Polling fallback when generating - catches updates if realtime fails
  useEffect(() => {
    if (!generating || !runId) return;
    
    const interval = setInterval(() => {
      fetchJob();
      fetchImagesWithCrops();
    }, 3000);
    
    return () => clearInterval(interval);
  }, [generating, runId]);

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
      // Reset generating when job is no longer active
      if (data.status === 'completed' || data.status === 'failed') {
        setGenerating(false);
      } else if (data.status === 'running' || data.status === 'pending') {
        setGenerating(true);
      }
    }
  };

  const handleGenerateCrops = async () => {
    if (!runId) return;
    setGenerating(true);
    setJob(null); // Clear stale job display
    
    try {
      const { error } = await supabase.functions.invoke('generate-face-crops', {
        body: { runId, aspectRatio },
      });

      if (error) throw error;
      toast({ title: "Started", description: "Crop generation started" });
      
      // Force re-fetch to capture new job
      setTimeout(() => {
        fetchJob();
        fetchImagesWithCrops();
      }, 1000);
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

  const getAspectMultiplier = () => aspectRatio === '1:1' ? 1 : 1.25; // height = width * multiplier

  const handleCropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.parentElement!.getBoundingClientRect();
    setInteractionMode('move');
    setDragStart({ x: e.clientX, y: e.clientY });
    setStartCrop({ ...cropRect });
  };

  const handleCornerMouseDown = (e: React.MouseEvent<HTMLDivElement>, corner: 'nw' | 'ne' | 'sw' | 'se') => {
    e.stopPropagation();
    setInteractionMode(corner);
    setDragStart({ x: e.clientX, y: e.clientY });
    setStartCrop({ ...cropRect });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (interactionMode === 'none') return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const containerWidth = rect.width;
    const containerHeight = rect.height;
    const aspectMultiplier = getAspectMultiplier();
    const minSize = 30; // minimum pixel size
    
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;

    if (interactionMode === 'move') {
      // Move mode - just translate
      const newX = Math.max(0, Math.min(startCrop.x + deltaX, containerWidth - startCrop.width));
      const newY = Math.max(0, Math.min(startCrop.y + deltaY, containerHeight - startCrop.height));
      setCropRect(prev => ({ ...prev, x: newX, y: newY }));
    } else {
      // Resize from corner - maintain aspect ratio
      let newX = startCrop.x;
      let newY = startCrop.y;
      let newWidth = startCrop.width;
      let newHeight = startCrop.height;

      if (interactionMode === 'se') {
        // SE corner - fixed top-left, grow/shrink bottom-right
        newWidth = Math.max(minSize, startCrop.width + deltaX);
        newHeight = newWidth * aspectMultiplier;
        // Constrain to container
        if (newX + newWidth > containerWidth) {
          newWidth = containerWidth - newX;
          newHeight = newWidth * aspectMultiplier;
        }
        if (newY + newHeight > containerHeight) {
          newHeight = containerHeight - newY;
          newWidth = newHeight / aspectMultiplier;
        }
      } else if (interactionMode === 'sw') {
        // SW corner - fixed top-right
        newWidth = Math.max(minSize, startCrop.width - deltaX);
        newHeight = newWidth * aspectMultiplier;
        newX = startCrop.x + startCrop.width - newWidth;
        if (newX < 0) {
          newX = 0;
          newWidth = startCrop.x + startCrop.width;
          newHeight = newWidth * aspectMultiplier;
        }
        if (newY + newHeight > containerHeight) {
          newHeight = containerHeight - newY;
          newWidth = newHeight / aspectMultiplier;
          newX = startCrop.x + startCrop.width - newWidth;
        }
      } else if (interactionMode === 'ne') {
        // NE corner - fixed bottom-left
        newWidth = Math.max(minSize, startCrop.width + deltaX);
        newHeight = newWidth * aspectMultiplier;
        newY = startCrop.y + startCrop.height - newHeight;
        if (newX + newWidth > containerWidth) {
          newWidth = containerWidth - newX;
          newHeight = newWidth * aspectMultiplier;
          newY = startCrop.y + startCrop.height - newHeight;
        }
        if (newY < 0) {
          newY = 0;
          newHeight = startCrop.y + startCrop.height;
          newWidth = newHeight / aspectMultiplier;
        }
      } else if (interactionMode === 'nw') {
        // NW corner - fixed bottom-right
        newWidth = Math.max(minSize, startCrop.width - deltaX);
        newHeight = newWidth * aspectMultiplier;
        newX = startCrop.x + startCrop.width - newWidth;
        newY = startCrop.y + startCrop.height - newHeight;
        if (newX < 0) {
          newX = 0;
          newWidth = startCrop.x + startCrop.width;
          newHeight = newWidth * aspectMultiplier;
          newY = startCrop.y + startCrop.height - newHeight;
        }
        if (newY < 0) {
          newY = 0;
          newHeight = startCrop.y + startCrop.height;
          newWidth = newHeight / aspectMultiplier;
          newX = startCrop.x + startCrop.width - newWidth;
        }
      }

      setCropRect({ x: newX, y: newY, width: newWidth, height: newHeight });
    }
  };

  const handleMouseUp = () => {
    setInteractionMode('none');
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
                ref={editorContainerRef}
                className="relative bg-muted rounded-lg overflow-hidden"
                style={{ aspectRatio: '3/4' }}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <img
                  src={selectedImage.stored_url || selectedImage.source_url}
                  alt=""
                  className="w-full h-full object-contain"
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    const container = editorContainerRef.current;
                    if (!container) return;
                    
                    const containerWidth = container.clientWidth;
                    const containerHeight = container.clientHeight;
                    
                    setContainerDimensions({ width: containerWidth, height: containerHeight });
                    
                    // Calculate actual rendered image bounds with object-contain
                    const imgAspect = img.naturalWidth / img.naturalHeight;
                    const containerAspect = containerWidth / containerHeight;
                    
                    let renderedWidth, renderedHeight, offsetX, offsetY;
                    
                    if (imgAspect > containerAspect) {
                      // Image is wider - constrained by width
                      renderedWidth = containerWidth;
                      renderedHeight = containerWidth / imgAspect;
                      offsetX = 0;
                      offsetY = (containerHeight - renderedHeight) / 2;
                    } else {
                      // Image is taller - constrained by height
                      renderedHeight = containerHeight;
                      renderedWidth = containerHeight * imgAspect;
                      offsetX = (containerWidth - renderedWidth) / 2;
                      offsetY = 0;
                    }
                    
                    setImageBounds({ offsetX, offsetY, width: renderedWidth, height: renderedHeight });
                  }}
                />
                {/* Crop overlay with resize handles */}
                <div 
                  className="absolute border-2 border-primary bg-primary/20 cursor-move"
                  style={{
                    left: cropRect.x,
                    top: cropRect.y,
                    width: cropRect.width,
                    height: cropRect.height,
                  }}
                  onMouseDown={handleCropMouseDown}
                >
                  {/* NW Corner */}
                  <div 
                    className="absolute w-3 h-3 bg-primary border border-background cursor-nw-resize rounded-sm"
                    style={{ top: -6, left: -6 }}
                    onMouseDown={(e) => handleCornerMouseDown(e, 'nw')}
                  />
                  {/* NE Corner */}
                  <div 
                    className="absolute w-3 h-3 bg-primary border border-background cursor-ne-resize rounded-sm"
                    style={{ top: -6, right: -6 }}
                    onMouseDown={(e) => handleCornerMouseDown(e, 'ne')}
                  />
                  {/* SW Corner */}
                  <div 
                    className="absolute w-3 h-3 bg-primary border border-background cursor-sw-resize rounded-sm"
                    style={{ bottom: -6, left: -6 }}
                    onMouseDown={(e) => handleCornerMouseDown(e, 'sw')}
                  />
                  {/* SE Corner */}
                  <div 
                    className="absolute w-3 h-3 bg-primary border border-background cursor-se-resize rounded-sm"
                    style={{ bottom: -6, right: -6 }}
                    onMouseDown={(e) => handleCornerMouseDown(e, 'se')}
                  />
                </div>
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
                  className="bg-muted rounded-lg overflow-hidden relative"
                  style={{ aspectRatio: aspectRatio === '1:1' ? '1/1' : '4/5' }}
                >
                  {(selectedImage.crop || cropRect.width > 0) && imageBounds.width > 0 ? (
                    <div 
                      className="w-full h-full overflow-hidden relative"
                    >
                      {(() => {
                        // Convert crop coordinates from container-space to image-space
                        const cropXInImage = cropRect.x - imageBounds.offsetX;
                        const cropYInImage = cropRect.y - imageBounds.offsetY;
                        
                        // Calculate percentages relative to the actual image dimensions
                        const cropXPercent = (cropXInImage / imageBounds.width) * 100;
                        const cropYPercent = (cropYInImage / imageBounds.height) * 100;
                        const cropWidthPercent = (cropRect.width / imageBounds.width) * 100;
                        const cropHeightPercent = (cropRect.height / imageBounds.height) * 100;
                        
                        // Scale factor: use uniform scale to maintain aspect ratio
                        const scale = 100 / cropWidthPercent;
                        
                        return (
                          <img
                            src={selectedImage.stored_url || selectedImage.source_url}
                            alt=""
                            className="absolute"
                            style={{
                              transformOrigin: 'top left',
                              transform: `scale(${scale})`,
                              left: `${-cropXPercent * scale}%`,
                              top: `${-cropYPercent * scale}%`,
                              width: '100%',
                              height: 'auto',
                            }}
                          />
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                      No crop defined
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
