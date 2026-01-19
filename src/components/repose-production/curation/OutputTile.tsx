import { useState, memo } from "react";
import { cn } from "@/lib/utils";
import { Star, Loader2 } from "lucide-react";
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

export const OutputTile = memo(function OutputTile({
  output,
  onToggleSelection,
  onOpenLightbox,
  isViewFull,
}: OutputTileProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  
  const isSelected = output.is_favorite;
  const rank = output.favorite_rank;

  // Use thumb tier (280px) for tiles - much faster loading
  const thumbnailUrl = getImageUrl(output.result_url, 'thumb');

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
        "relative aspect-[3/4] rounded-lg overflow-hidden cursor-pointer transition-all group",
        "border-2 bg-muted/50",
        isSelected 
          ? "border-primary ring-2 ring-primary/30" 
          : "border-transparent hover:border-primary/50"
      )}
    >
      {/* Loading State */}
      {isLoading && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error State */}
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <span className="text-xs text-muted-foreground">Failed</span>
        </div>
      )}

      {/* Image */}
      {output.result_url && (
        <img
          src={thumbnailUrl}
          alt={`Output ${output.attempt_index}`}
          className={cn(
            "w-full h-full object-contain transition-opacity duration-200",
            isLoading ? "opacity-0" : "opacity-100"
          )}
          loading="lazy"
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
        />
      )}

      {/* Selection Overlay */}
      {isSelected && rank && (
        <>
          {/* Rank Badge */}
          <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-primary text-primary-foreground text-xs font-bold rounded">
            {RANK_LABELS[rank]}
          </div>

          {/* Star Icon */}
          <div className="absolute top-1 right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
            <Star className="w-3 h-3 text-primary-foreground fill-current" />
          </div>
        </>
      )}

      {/* Selection Button - Always visible on hover */}
      <button
        onClick={handleSelectionClick}
        className={cn(
          "absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full flex items-center justify-center transition-all",
          "opacity-0 group-hover:opacity-100",
          isSelected
            ? "bg-primary text-primary-foreground"
            : isViewFull
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-white/90 text-foreground hover:bg-primary hover:text-primary-foreground shadow-sm"
        )}
        title={isSelected ? "Remove selection" : isViewFull ? "View is full (3 max)" : "Add to favorites"}
      >
        <Star className={cn("w-3.5 h-3.5", isSelected && "fill-current")} />
      </button>

      {/* Click hint overlay */}
      <div className={cn(
        "absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent",
        "opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
      )}>
        <span className="absolute bottom-1.5 left-1.5 text-white text-[10px] font-medium">
          Click to enlarge
        </span>
      </div>
    </div>
  );
});

export default OutputTile;