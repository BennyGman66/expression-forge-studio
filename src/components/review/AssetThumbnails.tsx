import { cn } from '@/lib/utils';
import { SubmissionAsset } from '@/types/review';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare } from 'lucide-react';

interface AssetThumbnailsProps {
  assets: SubmissionAsset[];
  selectedAssetId: string | null;
  onSelect: (asset: SubmissionAsset) => void;
  annotationCounts: Record<string, number>;
  orientation?: 'horizontal' | 'vertical';
}

export function AssetThumbnails({
  assets,
  selectedAssetId,
  onSelect,
  annotationCounts,
  orientation = 'vertical',
}: AssetThumbnailsProps) {
  if (assets.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        No assets in this submission
      </div>
    );
  }

  const content = (
    <div className={cn(
      "gap-2 p-2",
      orientation === 'horizontal' ? 'flex' : 'flex flex-col'
    )}>
      {assets.map((asset, idx) => {
        const isSelected = asset.id === selectedAssetId;
        const annotationCount = annotationCounts[asset.id] || 0;

        return (
          <button
            key={asset.id}
            onClick={() => onSelect(asset)}
            className={cn(
              "relative group rounded-lg overflow-hidden border-2 transition-all shrink-0",
              isSelected
                ? "border-primary ring-2 ring-primary/30"
                : "border-transparent hover:border-muted-foreground/30"
            )}
          >
            <div className={cn(
              "bg-muted",
              orientation === 'horizontal' ? 'w-20 h-20' : 'w-full aspect-square'
            )}>
              {asset.file_url ? (
                <img
                  src={asset.file_url}
                  alt={asset.label || `Asset ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                  No image
                </div>
              )}
            </div>

            {/* Label */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1">
              <p className="text-[10px] text-white font-medium truncate">
                {asset.label || `Asset ${idx + 1}`}
              </p>
            </div>

            {/* Annotation count */}
            {annotationCount > 0 && (
              <Badge 
                variant="secondary" 
                className="absolute top-1 right-1 h-5 px-1.5 text-[10px] gap-0.5"
              >
                <MessageSquare className="h-2.5 w-2.5" />
                {annotationCount}
              </Badge>
            )}

            {/* Selection indicator */}
            {isSelected && (
              <div className="absolute top-1 left-1 w-2 h-2 rounded-full bg-primary" />
            )}
          </button>
        );
      })}
    </div>
  );

  if (orientation === 'vertical') {
    return <ScrollArea className="h-full">{content}</ScrollArea>;
  }

  return (
    <div className="w-full overflow-x-auto">
      {content}
    </div>
  );
}
