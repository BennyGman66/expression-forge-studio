import { useCallback, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, X, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { OUTPUT_SHOT_LABELS, OutputShotType } from "@/types/shot-types";
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
            const rank = parseInt(e.key) as 1 | 2 | 3;
            // Direct rank assignment would need additional logic
            // For now, toggle works as primary action
            handleToggle();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handlePrevious, handleNext, handleToggle, onClose, currentImage]);

  if (!currentImage) return null;

  const isSelected = currentImage.output.is_favorite;
  const rank = currentImage.output.favorite_rank;
  const nextRank = !isSelected ? getNextRank(currentImage.output) : null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl h-[90vh] p-0 bg-black/95 border-none">
        <div className="relative h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 text-white">
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
          <div className="flex-1 flex items-center justify-center relative px-16">
            {/* Previous Button */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-4 text-white hover:bg-white/10 w-12 h-12"
              onClick={handlePrevious}
            >
              <ChevronLeft className="w-8 h-8" />
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
              className="absolute right-4 text-white hover:bg-white/10 w-12 h-12"
              onClick={handleNext}
            >
              <ChevronRight className="w-8 h-8" />
            </Button>
          </div>

          {/* Footer with Selection */}
          <div className="p-4 flex items-center justify-center gap-4">
            <Button
              variant={isSelected ? "default" : "outline"}
              onClick={handleToggle}
              className={cn(
                "gap-2",
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : "border-white/30 text-white hover:bg-white/10"
              )}
            >
              <Star className={cn("w-4 h-4", isSelected && "fill-current")} />
              {isSelected 
                ? `Selected (${RANK_LABELS[rank!]})` 
                : nextRank 
                  ? `Select as ${RANK_LABELS[nextRank]}`
                  : "View is full"
              }
            </Button>
            <span className="text-xs text-white/50">
              Press Space to toggle • Arrow keys to navigate
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
