import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClipboardList, Star, RefreshCw, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useReposeBatch, useReposeBatchItems, useReposeOutputs } from "@/hooks/useReposeBatches";
import { LeapfrogLoader } from "@/components/ui/LeapfrogLoader";
import { cn } from "@/lib/utils";

interface ReviewPanelProps {
  batchId: string | undefined;
}

interface LightboxImage {
  id: string;
  url: string;
  slot: string;
  itemView: string;
}

export function ReviewPanel({ batchId }: ReviewPanelProps) {
  const { data: batch, isLoading: batchLoading } = useReposeBatch(batchId);
  const { data: batchItems } = useReposeBatchItems(batchId);
  const { data: outputs } = useReposeOutputs(batchId);

  const [selectedOutputs, setSelectedOutputs] = useState<Set<string>>(new Set());
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Build flat list of all completed images for the lightbox
  const allCompletedImages: LightboxImage[] = [];
  outputs?.forEach((output) => {
    if (output.status === 'complete' && output.result_url) {
      const item = batchItems?.find(i => i.id === output.batch_item_id);
      allCompletedImages.push({
        id: output.id,
        url: output.result_url,
        slot: output.slot || 'unknown',
        itemView: item?.view || 'Unknown View',
      });
    }
  });

  // Group outputs by batch_item_id, then by slot
  const groupedOutputs = outputs?.reduce((acc, output) => {
    const itemId = output.batch_item_id;
    if (!acc[itemId]) acc[itemId] = {};
    const slot = output.slot || 'unknown';
    if (!acc[itemId][slot]) acc[itemId][slot] = [];
    acc[itemId][slot].push(output);
    return acc;
  }, {} as Record<string, Record<string, typeof outputs>>) || {};

  const toggleSelection = (outputId: string) => {
    const newSelected = new Set(selectedOutputs);
    if (newSelected.has(outputId)) {
      newSelected.delete(outputId);
    } else {
      newSelected.add(outputId);
    }
    setSelectedOutputs(newSelected);
  };

  const openLightbox = (outputId: string) => {
    const index = allCompletedImages.findIndex(img => img.id === outputId);
    if (index !== -1) {
      setLightboxIndex(index);
      setLightboxOpen(true);
    }
  };

  const handlePrevious = useCallback(() => {
    setLightboxIndex(prev => (prev > 0 ? prev - 1 : allCompletedImages.length - 1));
  }, [allCompletedImages.length]);

  const handleNext = useCallback(() => {
    setLightboxIndex(prev => (prev < allCompletedImages.length - 1 ? prev + 1 : 0));
  }, [allCompletedImages.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') handlePrevious();
      else if (e.key === 'ArrowRight') handleNext();
      else if (e.key === 'Escape') setLightboxOpen(false);
      else if (e.key === ' ') {
        e.preventDefault();
        const currentImg = allCompletedImages[lightboxIndex];
        if (currentImg) toggleSelection(currentImg.id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen, lightboxIndex, handlePrevious, handleNext, allCompletedImages]);

  const currentLightboxImage = allCompletedImages[lightboxIndex];
  const completedCount = outputs?.filter(o => o.status === 'complete').length || 0;
  const failedCount = outputs?.filter(o => o.status === 'failed').length || 0;

  if (batchLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LeapfrogLoader />
      </div>
    );
  }

  if (!outputs?.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No outputs to review yet. Run generation first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Lightbox Dialog */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-5xl h-[90vh] p-0 bg-black/95 border-none">
          <div className="relative h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 text-white">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="border-white/30 text-white">
                  {currentLightboxImage?.slot ? `Slot ${currentLightboxImage.slot}` : ''}
                </Badge>
                <span className="text-sm text-white/70">{currentLightboxImage?.itemView}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-white/70">
                  {lightboxIndex + 1} / {allCompletedImages.length}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/10"
                  onClick={() => setLightboxOpen(false)}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Main image area */}
            <div className="flex-1 flex items-center justify-center relative px-16">
              {/* Previous button */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-4 text-white hover:bg-white/10 w-12 h-12"
                onClick={handlePrevious}
              >
                <ChevronLeft className="w-8 h-8" />
              </Button>

              {/* Image */}
              {currentLightboxImage && (
                <img
                  src={currentLightboxImage.url}
                  alt={`Output ${lightboxIndex + 1}`}
                  className="max-h-full max-w-full object-contain"
                />
              )}

              {/* Next button */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-4 text-white hover:bg-white/10 w-12 h-12"
                onClick={handleNext}
              >
                <ChevronRight className="w-8 h-8" />
              </Button>
            </div>

            {/* Footer with selection */}
            <div className="p-4 flex items-center justify-center gap-4">
              <Button
                variant={currentLightboxImage && selectedOutputs.has(currentLightboxImage.id) ? "default" : "outline"}
                onClick={() => currentLightboxImage && toggleSelection(currentLightboxImage.id)}
                className={cn(
                  "gap-2",
                  currentLightboxImage && selectedOutputs.has(currentLightboxImage.id)
                    ? "bg-primary text-primary-foreground"
                    : "border-white/30 text-white hover:bg-white/10"
                )}
              >
                <Star className={cn(
                  "w-4 h-4",
                  currentLightboxImage && selectedOutputs.has(currentLightboxImage.id) && "fill-current"
                )} />
                {currentLightboxImage && selectedOutputs.has(currentLightboxImage.id) ? 'Selected' : 'Select'}
              </Button>
              <span className="text-xs text-white/50">Press Space to toggle selection</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Summary Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold text-green-500">{completedCount}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Failed</p>
                <p className="text-2xl font-bold text-red-500">{failedCount}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Selected</p>
                <p className="text-2xl font-bold">{selectedOutputs.size}</p>
              </div>
            </div>
            {failedCount > 0 && (
              <Button variant="outline" className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Re-run Failed ({failedCount})
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results by Batch Item */}
      <ScrollArea className="h-[600px]">
        <div className="space-y-6">
          {batchItems?.map((item) => {
            const itemOutputs = groupedOutputs[item.id] || {};
            const slots = Object.keys(itemOutputs);

            if (slots.length === 0) return null;

            return (
              <Card key={item.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <ClipboardList className="w-4 h-4" />
                        {item.view.toUpperCase()} View
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Item: {item.id.slice(0, 8)}...
                      </CardDescription>
                    </div>
                    <Badge variant="outline">
                      {Object.values(itemOutputs).flat().filter(o => o?.status === 'complete').length} complete
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Source Image */}
                  <div className="mb-4">
                    <p className="text-xs text-muted-foreground mb-2">Source</p>
                    <div className="w-24 h-24 bg-secondary rounded-lg overflow-hidden">
                      {item.source_url ? (
                        <img 
                          src={item.source_url} 
                          alt="Source" 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          No image
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Outputs by Slot */}
                  {slots.map((slot) => (
                    <div key={slot} className="mb-4">
                      <p className="text-sm font-medium mb-2">Slot {slot}</p>
                      <div className="flex flex-wrap gap-2">
                        {itemOutputs[slot]?.map((output) => (
                          <div
                            key={output.id}
                            onClick={() => {
                              if (output.status === 'complete' && output.result_url) {
                                openLightbox(output.id);
                              }
                            }}
                            className={cn(
                              "relative w-20 h-20 rounded-lg overflow-hidden cursor-pointer border-2 transition-all hover:scale-105",
                              output.status === 'complete' && selectedOutputs.has(output.id)
                                ? "border-primary ring-2 ring-primary/20"
                                : "border-transparent",
                              output.status === 'failed' && "opacity-50 cursor-not-allowed"
                            )}
                          >
                            {output.result_url ? (
                              <img 
                                src={output.result_url} 
                                alt={`Output ${output.attempt_index}`}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full bg-secondary flex items-center justify-center">
                                {output.status === 'queued' && <span className="text-xs">Queued</span>}
                                {output.status === 'running' && <LeapfrogLoader />}
                                {output.status === 'failed' && <span className="text-xs text-red-500">Failed</span>}
                              </div>
                            )}

                            {/* Selection indicator */}
                            {output.status === 'complete' && selectedOutputs.has(output.id) && (
                              <div className="absolute top-1 right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                                <Star className="w-3 h-3 text-primary-foreground fill-current" />
                              </div>
                            )}

                            {/* Status indicator */}
                            {output.status === 'complete' && !selectedOutputs.has(output.id) && (
                              <div className="absolute top-1 right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                                <CheckCircle2 className="w-3 h-3 text-white" />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
