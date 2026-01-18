import { useCallback, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { ChevronLeft, ChevronRight, X, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { OUTPUT_SHOT_LABELS, OutputShotType } from "@/types/shot-types";
import { getImageUrl } from "@/lib/imageUtils";
import type { ReposeOutput } from "@/types/repose";

interface CurationLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  images: Array<{
    id: string;
    url: string;
    shotType: OutputShotType;
    output: ReposeOutput;
  }>;
  currentIndex: number;
  onNavigate: (index: number) => void;
  onToggleSelection: (output: ReposeOutput) => void;
  getNextRank: (output: ReposeOutput) => 1 | 2 | 3 | null;
}

const RANK_LABELS: Record<number, string> = {
  1: "1st",
  2: "2nd",
  3: "3rd",
};

export function CurationLightbox({
  isOpen,
  onClose,
  images,
  currentIndex,
  onNavigate,
  onToggleSelection,
  getNextRank,
}: CurationLightboxProps) {
  const currentImage = images[currentIndex];
  const filmstripRef = useRef<HTMLDivElement>(null);

  const handlePrevious = useCallback(() => {
    onNavigate(currentIndex > 0 ? currentIndex - 1 : images.length - 1);
  }, [currentIndex, images.length, onNavigate]);

  const handleNext = useCallback(() => {
    onNavigate(currentIndex < images.length - 1 ? currentIndex + 1 : 0);
  }, [currentIndex, images.length, onNavigate]);

  const handleToggle = useCallback(() => {
    if (currentImage) {
      onToggleSelection(currentImage.output);
    }
  }, [currentImage, onToggleSelection]);

  // Scroll filmstrip to keep current image visible
  useEffect(() => {
    if (filmstripRef.current && isOpen) {
      const thumbnails = filmstripRef.current.querySelectorAll('[data-thumbnail]');
      const currentThumb = thumbnails[currentIndex] as HTMLElement;
      if (currentThumb) {
        currentThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [currentIndex, isOpen]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowLeft":
          handlePrevious();
          break;
        case "ArrowRight":
          handleNext();
          break;
        case "Escape":
          onClose();
          break;
        case " ":
          e.preventDefault();
          handleToggle();
          break;
        case "1":
        case "2":
        case "3":
          e.preventDefault();
          if (currentImage) {
            handleToggle();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handlePrevious, handleNext, handleToggle, onClose, currentImage]);

  const isSelected = currentImage?.output.is_favorite;
  const rank = currentImage?.output.favorite_rank;
  const nextRank = currentImage && !isSelected ? getNextRank(currentImage.output) : null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-7xl h-[95vh] p-0 bg-black/98 border-none z-[100]">
        <VisuallyHidden>
          <DialogTitle>Image Viewer</DialogTitle>
        </VisuallyHidden>
        {!currentImage ? (
          <div className="flex items-center justify-center h-full text-white/50">
            No images to display
          </div>
        ) : (
        <div className="relative h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 text-white flex-shrink-0">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="border-white/30 text-white">
                {OUTPUT_SHOT_LABELS[currentImage.shotType]}
              </Badge>
              {isSelected && rank && (
                <Badge className="bg-primary text-primary-foreground">
                  {RANK_LABELS[rank]}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-white/70">
                {currentIndex + 1} / {images.length}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10"
                onClick={onClose}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Main Image Area */}
          <div className="flex-1 flex items-center justify-center relative px-16 min-h-0">
            {/* Previous Button */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-4 text-white hover:bg-white/10 w-14 h-14 z-10"
              onClick={handlePrevious}
            >
              <ChevronLeft className="w-10 h-10" />
            </Button>

            {/* Image */}
            <img
              src={currentImage.url}
              alt={`Output ${currentIndex + 1}`}
              className="max-h-full max-w-full object-contain"
            />

            {/* Next Button */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 text-white hover:bg-white/10 w-14 h-14 z-10"
              onClick={handleNext}
            >
              <ChevronRight className="w-10 h-10" />
            </Button>
          </div>

          {/* Selection Controls */}
          <div className="py-3 flex items-center justify-center gap-4 flex-shrink-0">
            <Button
              variant={isSelected ? "default" : "outline"}
              size="lg"
              onClick={handleToggle}
              className={cn(
                "gap-2 min-w-40",
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : "border-white/30 text-white hover:bg-white/10"
              )}
            >
              <Star className={cn("w-5 h-5", isSelected && "fill-current")} />
              {isSelected 
                ? `Selected (${RANK_LABELS[rank!]})` 
                : nextRank 
                  ? `Select as ${RANK_LABELS[nextRank]}`
                  : "View is full"
              }
            </Button>
            <span className="text-xs text-white/50">
              Space = toggle • ← → = navigate
            </span>
          </div>

          {/* Filmstrip Navigation */}
          <div className="flex-shrink-0 bg-black/50 border-t border-white/10">
            <ScrollArea className="w-full" ref={filmstripRef}>
              <div className="flex gap-2 p-3 justify-center min-w-max">
                {images.map((img, idx) => {
                  const imgIsSelected = img.output.is_favorite;
                  const imgRank = img.output.favorite_rank;
                  const isCurrent = idx === currentIndex;
                  
                  return (
                    <button
                      key={img.id}
                      data-thumbnail
                      onClick={() => onNavigate(idx)}
                      className={cn(
                        "relative w-16 h-16 flex-shrink-0 rounded-md overflow-hidden transition-all",
                        "border-2",
                        isCurrent 
                          ? "border-white ring-2 ring-white/50 scale-110" 
                          : imgIsSelected 
                            ? "border-primary opacity-90 hover:opacity-100" 
                            : "border-transparent opacity-60 hover:opacity-90"
                      )}
                    >
                      <img 
                        src={getImageUrl(img.url, 'tiny')} 
                        alt={`Thumbnail ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      {imgIsSelected && imgRank && (
                        <div className="absolute top-0.5 left-0.5 px-1 py-0.5 bg-primary text-primary-foreground text-[10px] font-bold rounded">
                          {imgRank}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
