import { useState } from 'react';
import { cn } from '@/lib/utils';
import { fixBrokenStorageUrl } from '@/lib/fileUtils';
import { SubmissionAsset, AssetReviewStatus } from '@/types/review';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { MessageSquare, Check, AlertTriangle, Clock, Lock, ChevronDown, History } from 'lucide-react';
import { AssetSlot } from '@/hooks/useReviewSystem';

interface AssetThumbnailsProps {
  assetSlots: AssetSlot[];
  selectedAssetId: string | null;
  onSelect: (asset: SubmissionAsset) => void;
  annotationCounts: Record<string, number>;
  orientation?: 'horizontal' | 'vertical';
  // For viewing historical versions temporarily
  viewingVersionId?: string | null;
  onViewVersion?: (asset: SubmissionAsset | null) => void;
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
  assetSlots,
  selectedAssetId,
  onSelect,
  annotationCounts,
  orientation = 'vertical',
  viewingVersionId,
  onViewVersion,
}: AssetThumbnailsProps) {
  const [openVersionPopover, setOpenVersionPopover] = useState<string | null>(null);

  if (assetSlots.length === 0) {
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
      {assetSlots.map((slot, idx) => {
        const asset = slot.current;
        const hasHistory = slot.history.length > 0;
        const currentVersion = asset.revision_number || 1;
        
        // Check if we're viewing a historical version of this slot
        const isViewingHistory = viewingVersionId && slot.history.some(h => h.id === viewingVersionId);
        const displayedAsset = isViewingHistory 
          ? slot.history.find(h => h.id === viewingVersionId) || asset
          : asset;
        
        const isSelected = displayedAsset.id === selectedAssetId;
        const annotationCount = annotationCounts[displayedAsset.id] || 0;
        const isApproved = asset.review_status === 'APPROVED';
        
        return (
          <Tooltip key={slot.slotKey}>
            <TooltipTrigger asChild>
              <div className="relative">
                <button
                  onClick={() => onSelect(displayedAsset)}
                  className={cn(
                    "relative group rounded-lg overflow-hidden border-2 transition-all shrink-0 w-full",
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
                    {displayedAsset.file_url ? (
                      <img
                        src={fixBrokenStorageUrl(displayedAsset.file_url)}
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
                  {annotationCount > 0 && !hasHistory && (
                    <Badge 
                      variant="secondary" 
                      className="absolute top-1 right-1 h-5 px-1.5 text-[10px] gap-0.5"
                    >
                      <MessageSquare className="h-2.5 w-2.5" />
                      {annotationCount}
                    </Badge>
                  )}
                </button>

                {/* Version Badge with Dropdown - top right */}
                {hasHistory && (
                  <Popover 
                    open={openVersionPopover === slot.slotKey} 
                    onOpenChange={(open) => setOpenVersionPopover(open ? slot.slotKey : null)}
                  >
                    <PopoverTrigger asChild>
                      <button
                        className={cn(
                          "absolute top-1 right-1 h-5 px-1.5 rounded text-[10px] flex items-center gap-0.5 transition-colors",
                          "bg-background/90 border border-border hover:bg-muted shadow-sm",
                          isViewingHistory && "bg-amber-500/20 border-amber-500/50 text-amber-300"
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenVersionPopover(openVersionPopover === slot.slotKey ? null : slot.slotKey);
                        }}
                      >
                        <History className="h-2.5 w-2.5" />
                        V{isViewingHistory ? (displayedAsset.revision_number || 1) : currentVersion}
                        <ChevronDown className="h-2.5 w-2.5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent 
                      side="right" 
                      align="start" 
                      className="w-32 p-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="text-[10px] text-muted-foreground px-2 py-1 font-medium">
                        Versions
                      </div>
                      {/* Current version */}
                      <button
                        className={cn(
                          "w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted flex items-center justify-between",
                          !isViewingHistory && "bg-primary/10 text-primary"
                        )}
                        onClick={() => {
                          onViewVersion?.(null); // Clear viewing history
                          onSelect(asset);
                          setOpenVersionPopover(null);
                        }}
                      >
                        <span>V{currentVersion}</span>
                        <Badge variant="outline" className="text-[9px] h-4 px-1">Current</Badge>
                      </button>
                      
                      {/* Historical versions */}
                      {slot.history.map((histAsset) => (
                        <button
                          key={histAsset.id}
                          className={cn(
                            "w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted flex items-center justify-between",
                            viewingVersionId === histAsset.id && "bg-amber-500/10 text-amber-300"
                          )}
                          onClick={() => {
                            onViewVersion?.(histAsset);
                            onSelect(histAsset);
                            setOpenVersionPopover(null);
                          }}
                        >
                          <span>V{histAsset.revision_number || 1}</span>
                          <span className="text-[9px] text-muted-foreground">
                            {new Date(histAsset.created_at).toLocaleDateString()}
                          </span>
                        </button>
                      ))}
                    </PopoverContent>
                  </Popover>
                )}
                
                {/* Annotation count when there's history */}
                {annotationCount > 0 && hasHistory && (
                  <Badge 
                    variant="secondary" 
                    className="absolute top-7 right-1 h-5 px-1.5 text-[10px] gap-0.5"
                  >
                    <MessageSquare className="h-2.5 w-2.5" />
                    {annotationCount}
                  </Badge>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              <p className="font-medium">{asset.label || `Asset ${idx + 1}`}</p>
              {hasHistory && (
                <p className="text-muted-foreground">
                  {isViewingHistory 
                    ? `Viewing V${displayedAsset.revision_number || 1} (historical)` 
                    : `V${currentVersion} • ${slot.history.length} older version${slot.history.length > 1 ? 's' : ''}`}
                </p>
              )}
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

// Legacy props adapter for backwards compatibility
interface LegacyAssetThumbnailsProps {
  assets: SubmissionAsset[];
  selectedAssetId: string | null;
  onSelect: (asset: SubmissionAsset) => void;
  annotationCounts: Record<string, number>;
  orientation?: 'horizontal' | 'vertical';
}

export function LegacyAssetThumbnails(props: LegacyAssetThumbnailsProps) {
  // Convert legacy assets array to assetSlots format
  const assetSlots: AssetSlot[] = props.assets.map(asset => ({
    slotKey: asset.label || `slot-${asset.sort_index}`,
    current: asset,
    history: [],
  }));
  
  return (
    <AssetThumbnails
      assetSlots={assetSlots}
      selectedAssetId={props.selectedAssetId}
      onSelect={props.onSelect}
      annotationCounts={props.annotationCounts}
      orientation={props.orientation}
    />
  );
}