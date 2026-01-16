import { cn } from '@/lib/utils';
import { fixBrokenStorageUrl } from '@/lib/fileUtils';
import { SubmissionAsset, AssetReviewStatus } from '@/types/review';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MessageSquare, Check, AlertTriangle, Clock, Lock } from 'lucide-react';

interface AssetThumbnailsProps {
  assets: SubmissionAsset[];
  selectedAssetId: string | null;
  onSelect: (asset: SubmissionAsset) => void;
  annotationCounts: Record<string, number>;
  orientation?: 'horizontal' | 'vertical';
}

function getStatusIndicator(status: AssetReviewStatus) {
  if (status === 'APPROVED') {
    return (
      <div className="absolute top-1 left-1 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center shadow-lg ring-2 ring-green-500/30">
        <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
      </div>
    );
  }
  if (status === 'CHANGES_REQUESTED') {
    return (
      <div className="absolute top-1 left-1 w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center shadow-lg ring-2 ring-orange-500/30">
        <AlertTriangle className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
      </div>
    );
  }
  // Pending review - subtle indicator
  return (
    <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-muted-foreground/60 flex items-center justify-center">
      <Clock className="h-3 w-3 text-white" />
    </div>
  );
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

        const isApproved = asset.review_status === 'APPROVED';
        
        return (
          <Tooltip key={asset.id}>
            <TooltipTrigger asChild>
              <button
                onClick={() => onSelect(asset)}
                className={cn(
                  "relative group rounded-lg overflow-hidden border-2 transition-all shrink-0",
                  isSelected
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-transparent hover:border-muted-foreground/30",
                  isApproved && !isSelected && "border-green-500/50 bg-green-500/10",
                  asset.review_status === 'CHANGES_REQUESTED' && !isSelected && "border-orange-500 bg-orange-500/10",
                  !asset.review_status && !isSelected && "border-muted-foreground/30"
                )}
              >
                <div className={cn(
                  "bg-muted",
                  orientation === 'horizontal' ? 'w-20 h-20' : 'w-full aspect-square'
                )}>
                  {asset.file_url ? (
                    <img
                      src={fixBrokenStorageUrl(asset.file_url)}
                      alt={asset.label || `Asset ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                      No image
                    </div>
                  )}
                </div>

                {/* Status indicator */}
                {getStatusIndicator(asset.review_status)}

                {/* Approved lock overlay */}
                {isApproved && (
                  <div className="absolute inset-0 bg-green-500/10 flex items-center justify-center pointer-events-none">
                    <Lock className="h-4 w-4 text-green-400/50" />
                  </div>
                )}

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
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              <p className="font-medium">{asset.label || `Asset ${idx + 1}`}</p>
              {isApproved && (
                <p className="text-green-400 flex items-center gap-1">
                  <Lock className="h-3 w-3" /> Approved — Locked
                </p>
              )}
              {asset.review_status === 'CHANGES_REQUESTED' && (
                <p className="text-orange-400">Changes Requested</p>
              )}
            </TooltipContent>
          </Tooltip>
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
