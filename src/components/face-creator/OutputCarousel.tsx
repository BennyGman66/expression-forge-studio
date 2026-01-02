import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  MoreVertical, 
  Trash2, 
  Crop, 
  RefreshCw, 
  Star, 
  Check, 
  X, 
  Clock,
  ChevronLeft,
  ChevronRight,
  Plus
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LeapfrogLoader } from "@/components/ui/LeapfrogLoader";

interface OutputVariation {
  id: string;
  pairing_id: string;
  stored_url: string | null;
  status: string;
  is_face_foundation?: boolean;
  attempt_index: number;
}

interface OutputCarouselProps {
  pairingId: string;
  variations: OutputVariation[];
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onDelete?: (id: string) => void;
  onRegenerate?: (outputId: string) => void;
  onCrop?: (id: string) => void;
  onGenerateMore?: (pairingId: string, count: number) => void;
  sourcePreview?: React.ReactNode;
  talentAvatar?: string;
  isRegenerating?: boolean;
  generatingMore?: boolean;
}

export function OutputCarousel({
  pairingId,
  variations,
  isSelected,
  onToggleSelect,
  onDelete,
  onRegenerate,
  onCrop,
  onGenerateMore,
  sourcePreview,
  talentAvatar,
  isRegenerating = false,
  generatingMore = false,
}: OutputCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAddingToFoundation, setIsAddingToFoundation] = useState(false);

  // Sort variations by attempt_index
  const sortedVariations = [...variations].sort((a, b) => a.attempt_index - b.attempt_index);
  const currentVariation = sortedVariations[currentIndex] || sortedVariations[0];
  const totalVariations = sortedVariations.length;
  
  // Count foundation images in this carousel
  const foundationCount = sortedVariations.filter(v => v.is_face_foundation).length;

  const goToPrevious = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : totalVariations - 1));
  };

  const goToNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex(prev => (prev < totalVariations - 1 ? prev + 1 : 0));
  };

  const handleAddToFoundation = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentVariation) return;
    setIsAddingToFoundation(true);
    try {
      const { error } = await supabase
        .from("face_pairing_outputs")
        .update({ is_face_foundation: true })
        .eq("id", currentVariation.id);

      if (error) throw error;
      toast.success("Added to Face Foundations");
    } catch (error) {
      console.error("Error adding to foundation:", error);
      toast.error("Failed to add to Face Foundations");
    } finally {
      setIsAddingToFoundation(false);
    }
  };

  const handleRemoveFromFoundation = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentVariation) return;
    setIsAddingToFoundation(true);
    try {
      const { error } = await supabase
        .from("face_pairing_outputs")
        .update({ is_face_foundation: false })
        .eq("id", currentVariation.id);

      if (error) throw error;
      toast.success("Removed from Face Foundations");
    } catch (error) {
      console.error("Error removing from foundation:", error);
      toast.error("Failed to remove from Face Foundations");
    } finally {
      setIsAddingToFoundation(false);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentVariation) {
      onDelete?.(currentVariation.id);
      // Adjust index if we deleted the last item
      if (currentIndex >= totalVariations - 1 && currentIndex > 0) {
        setCurrentIndex(currentIndex - 1);
      }
    }
  };

  const handleRegenerate = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentVariation) {
      onRegenerate?.(currentVariation.id);
    }
  };

  const handleCrop = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentVariation) {
      onCrop?.(currentVariation.id);
    }
  };

  const handleGenerateMore = (count: number) => {
    onGenerateMore?.(pairingId, count);
  };

  if (!currentVariation) {
    return (
      <div className="relative aspect-square rounded-lg overflow-hidden bg-muted border-2 border-transparent flex items-center justify-center">
        <span className="text-xs text-muted-foreground">No outputs</span>
      </div>
    );
  }

  const isCurrentFoundation = currentVariation.is_face_foundation;

  return (
    <div
      className={`relative group aspect-square rounded-lg overflow-hidden bg-muted border-2 transition-colors cursor-pointer ${
        isSelected
          ? "border-primary"
          : "border-transparent hover:border-muted-foreground/30"
      }`}
      onClick={() => currentVariation.status === "completed" && onToggleSelect(currentVariation.id)}
    >
      {currentVariation.status === "completed" && currentVariation.stored_url && !isRegenerating ? (
        <>
          <img
            src={currentVariation.stored_url}
            alt=""
            className="w-full h-full object-cover"
          />
          
          {/* Foundation badge */}
          {isCurrentFoundation && (
            <div className="absolute top-2 left-2 bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded flex items-center gap-1">
              <Star className="h-3 w-3 fill-current" />
              Foundation
            </div>
          )}

          {/* Navigation arrows - only show if multiple variations */}
          {totalVariations > 1 && (
            <>
              <Button
                variant="secondary"
                size="icon"
                className="absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                onClick={goToPrevious}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                onClick={goToNext}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}

          {/* Position indicator */}
          <div className="absolute bottom-2 left-2 bg-black/70 px-2 py-0.5 rounded text-xs text-white">
            {currentIndex + 1} / {totalVariations}
          </div>

          {/* Foundation count badge (if any) */}
          {foundationCount > 0 && (
            <Badge 
              variant="secondary" 
              className="absolute bottom-2 right-10 bg-amber-500/90 text-white text-xs"
            >
              <Star className="h-2.5 w-2.5 mr-1 fill-current" />
              {foundationCount}
            </Badge>
          )}

          {/* Three-dots menu */}
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="secondary" size="icon" className="h-7 w-7">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                {!isCurrentFoundation ? (
                  <DropdownMenuItem onClick={handleAddToFoundation} disabled={isAddingToFoundation}>
                    <Star className="h-4 w-4 mr-2" />
                    Add to Foundation
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={handleRemoveFromFoundation} disabled={isAddingToFoundation}>
                    <Star className="h-4 w-4 mr-2" />
                    Remove from Foundation
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleCrop}>
                  <Crop className="h-4 w-4 mr-2" />
                  Crop / Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleRegenerate}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Regenerate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                
                {/* Generate More submenu */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Plus className="h-4 w-4 mr-2" />
                    Generate More
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => handleGenerateMore(1)}>
                      +1 variation
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleGenerateMore(2)}>
                      +2 variations
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleGenerateMore(4)}>
                      +4 variations
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleGenerateMore(8)}>
                      +8 variations
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleGenerateMore(12)}>
                      +12 variations
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleGenerateMore(24)}>
                      +24 variations
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Hover overlay with source images */}
          <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-end pointer-events-none">
            <div className="flex gap-1">
              {sourcePreview}
              {talentAvatar && (
                <div className="w-8 h-8 rounded-full overflow-hidden bg-muted/20">
                  <img
                    src={talentAvatar}
                    alt="Talent"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Selection indicator */}
          {isSelected && (
            <div className="absolute bottom-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
              <Check className="h-3 w-3 text-primary-foreground" />
            </div>
          )}
        </>
      ) : isRegenerating || currentVariation.status === "running" || generatingMore ? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-muted/50">
          <LeapfrogLoader message={generatingMore ? "Generating..." : isRegenerating ? "Regenerating..." : "Generating..."} size="md" />
        </div>
      ) : currentVariation.status === "failed" ? (
        <div className="w-full h-full flex flex-col items-center justify-center text-destructive">
          <X className="h-6 w-6 mb-2" />
          <span className="text-xs">Failed</span>
        </div>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
          <Clock className="h-6 w-6 mb-2" />
          <span className="text-xs">Pending</span>
        </div>
      )}
    </div>
  );
}
