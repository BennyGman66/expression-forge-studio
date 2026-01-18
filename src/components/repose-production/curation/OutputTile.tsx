import { cn } from "@/lib/utils";
import { Star } from "lucide-react";
import type { ReposeOutput } from "@/types/repose";
import { getImageUrl } from "@/lib/imageUtils";

interface OutputTileProps {
  output: ReposeOutput;
  onToggleSelection: () => void;
  onOpenLightbox: () => void;
  isViewFull: boolean;
}

const RANK_LABELS: Record<number, string> = {
  1: "1st",
  2: "2nd", 
  3: "3rd",
};

export function OutputTile({
  output,
  onToggleSelection,
  onOpenLightbox,
  isViewFull,
}: OutputTileProps) {
  const isSelected = output.is_favorite;
  const rank = output.favorite_rank;

  // Single click opens lightbox for better viewing
  const handleImageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenLightbox();
  };

  // Selection button click toggles favorite
  const handleSelectionClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isViewFull || isSelected) {
      onToggleSelection();
    }
  };

  return (
    <div
      onClick={handleImageClick}
      className={cn(
        "relative w-40 h-40 rounded-lg overflow-hidden cursor-pointer transition-all group",
        "border-2",
        isSelected 
          ? "border-primary ring-2 ring-primary/30" 
          : "border-transparent hover:border-primary/50"
      )}
    >
      {/* Image */}
      {output.result_url && (
        <img
          src={getImageUrl(output.result_url, 'preview')}
          alt={`Output ${output.attempt_index}`}
          className="w-full h-full object-cover"
        />
      )}

      {/* Selection Overlay */}
      {isSelected && rank && (
        <>
          {/* Rank Badge */}
          <div className="absolute top-1.5 left-1.5 px-2 py-1 bg-primary text-primary-foreground text-xs font-bold rounded">
            {RANK_LABELS[rank]}
          </div>

          {/* Star Icon */}
          <div className="absolute top-1.5 right-1.5 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
            <Star className="w-3.5 h-3.5 text-primary-foreground fill-current" />
          </div>
        </>
      )}

      {/* Selection Button - Always visible on hover */}
      <button
        onClick={handleSelectionClick}
        className={cn(
          "absolute bottom-2 right-2 w-8 h-8 rounded-full flex items-center justify-center transition-all",
          "opacity-0 group-hover:opacity-100",
          isSelected
            ? "bg-primary text-primary-foreground"
            : isViewFull
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-white/90 text-foreground hover:bg-primary hover:text-primary-foreground"
        )}
        title={isSelected ? "Remove selection" : isViewFull ? "View is full (3 max)" : "Add to favorites"}
      >
        <Star className={cn("w-4 h-4", isSelected && "fill-current")} />
      </button>

      {/* View hint overlay */}
      <div className={cn(
        "absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent",
        "opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
      )}>
        <span className="absolute bottom-2 left-2 text-white text-xs font-medium">
          Click to view
        </span>
      </div>
    </div>
  );
}
