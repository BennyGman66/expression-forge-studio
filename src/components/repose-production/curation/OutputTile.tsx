import { cn } from "@/lib/utils";
import { Star } from "lucide-react";
import type { ReposeOutput } from "@/types/repose";

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

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isViewFull || isSelected) {
      onToggleSelection();
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenLightbox();
  };

  return (
    <div
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      className={cn(
        "relative w-24 h-24 rounded-lg overflow-hidden cursor-pointer transition-all group",
        "border-2",
        isSelected 
          ? "border-primary ring-2 ring-primary/30 scale-105" 
          : "border-transparent hover:border-primary/50",
        isViewFull && !isSelected && "opacity-50 cursor-not-allowed"
      )}
    >
      {/* Image */}
      {output.result_url && (
        <img
          src={output.result_url}
          alt={`Output ${output.attempt_index}`}
          className="w-full h-full object-cover"
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

      {/* Hover Hint */}
      {!isSelected && !isViewFull && (
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="text-white text-xs font-medium">Click to select</span>
        </div>
      )}

      {/* Full View Hint */}
      {isViewFull && !isSelected && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
          <span className="text-white/80 text-xs text-center px-1">Replace existing</span>
        </div>
      )}
    </div>
  );
}
