import { useState, useRef, useMemo, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ImageViewer, ImageViewerHandle } from '@/components/review/ImageViewer';
import { ThreadPanel } from '@/components/review/ThreadPanel';
import { 
  useSubmissionAssets, 
  useReviewThreads, 
  useAssetAnnotations 
} from '@/hooks/useReviewSystem';
import type { SubmissionAsset, ImageAnnotation } from '@/types/review';
import { CheckCircle, AlertTriangle, Clock, Upload, X, FileImage } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fixBrokenStorageUrl } from '@/lib/fileUtils';

interface SubmissionReviewViewerProps {
  submissionId: string;
  jobId: string;
  onReplacementReady?: (replacements: Map<string, { file: File; preview: string }>) => void;
  showReplaceMode?: boolean;
}

export function SubmissionReviewViewer({ 
  submissionId, 
  jobId,
  onReplacementReady,
  showReplaceMode = false
}: SubmissionReviewViewerProps) {
  const { data: assets = [] } = useSubmissionAssets(submissionId);
  const { data: threads = [] } = useReviewThreads(submissionId);
  
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [replacements, setReplacements] = useState<Map<string, { file: File; preview: string }>>(new Map());
  
  const imageViewerRef = useRef<ImageViewerHandle>(null);

  // Auto-select first asset
  const selectedAsset = useMemo(() => {
    if (selectedAssetId) {
      return assets.find(a => a.id === selectedAssetId) || assets[0];
    }
    return assets[0];
  }, [assets, selectedAssetId]);

  // Fetch annotations for selected asset
  const { data: annotations = [] } = useAssetAnnotations(selectedAsset?.id || null);

  // Merge annotations with their threads
  const enrichedAnnotations: ImageAnnotation[] = useMemo(() => {
    return annotations.map(ann => ({
      ...ann,
      thread: threads.find(t => t.annotation_id === ann.id),
    }));
  }, [annotations, threads]);

  // Filter threads for this asset (for ThreadPanel - only show SHARED comments)
  const assetThreads = useMemo(() => {
    return threads
      .filter(t => t.asset_id === selectedAsset?.id)
      .map(thread => ({
        ...thread,
        // Filter out INTERNAL_ONLY comments for freelancers
        comments: thread.comments?.filter(c => c.visibility === 'SHARED'),
      }))
      .filter(t => (t.comments?.length || 0) > 0); // Only show threads with visible comments
  }, [threads, selectedAsset?.id]);

  const handleSelectAsset = (asset: SubmissionAsset) => {
    setSelectedAssetId(asset.id);
    setSelectedAnnotationId(null);
  };

  const handleAnnotationClick = useCallback((annotation: ImageAnnotation) => {
    setSelectedAnnotationId(annotation.id);
  }, []);

  const handleSelectAnnotation = useCallback((annotationId: string | null) => {
    setSelectedAnnotationId(annotationId);
  }, []);

  const handleJumpToAnnotation = useCallback((annotationId: string) => {
    imageViewerRef.current?.scrollToAnnotation(annotationId);
  }, []);

  // Handle file replacement for a specific asset
  const handleReplaceFile = (assetId: string, file: File) => {
    const preview = URL.createObjectURL(file);
    const newReplacements = new Map(replacements);
    
    // Clean up old preview if exists
    const old = newReplacements.get(assetId);
    if (old?.preview) {
      URL.revokeObjectURL(old.preview);
    }
    
    newReplacements.set(assetId, { file, preview });
    setReplacements(newReplacements);
    onReplacementReady?.(newReplacements);
  };

  const handleRemoveReplacement = (assetId: string) => {
    const newReplacements = new Map(replacements);
    const old = newReplacements.get(assetId);
    if (old?.preview) {
      URL.revokeObjectURL(old.preview);
    }
    newReplacements.delete(assetId);
    setReplacements(newReplacements);
    onReplacementReady?.(newReplacements);
  };

  const getAssetStatusBadge = (asset: SubmissionAsset) => {
    if (asset.review_status === 'APPROVED') {
      return (
        <Badge className="bg-green-500/20 text-green-400 gap-1">
          <CheckCircle className="h-3 w-3" />
          Approved
        </Badge>
      );
    }
    if (asset.review_status === 'CHANGES_REQUESTED') {
      return (
        <Badge className="bg-orange-500/20 text-orange-400 gap-1">
          <AlertTriangle className="h-3 w-3" />
          Needs Changes
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="gap-1">
        <Clock className="h-3 w-3" />
        Pending
      </Badge>
    );
  };

  if (assets.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No assets found for this submission.
      </div>
    );
  }

  const selectedImageUrl = fixBrokenStorageUrl(selectedAsset?.file_url);
  const replacement = selectedAsset ? replacements.get(selectedAsset.id) : null;
  const displayUrl = replacement?.preview || selectedImageUrl;

  return (
    <div className="flex h-[600px] border rounded-lg overflow-hidden bg-card">
      {/* Asset Sidebar */}
      <div className="w-48 border-r border-border bg-muted/30 flex flex-col">
        <div className="p-3 border-b border-border">
          <h3 className="font-medium text-sm">Assets</h3>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-2">
            {assets.map((asset) => {
              const isSelected = asset.id === selectedAsset?.id;
              const assetReplacement = replacements.get(asset.id);
              const hasChangesRequested = asset.review_status === 'CHANGES_REQUESTED';
              const isApproved = asset.review_status === 'APPROVED';
              
              return (
                <div
                  key={asset.id}
                  className={cn(
                    "relative rounded-lg border cursor-pointer transition-all overflow-hidden",
                    isSelected 
                      ? "border-primary ring-2 ring-primary/30" 
                      : "border-border hover:border-muted-foreground",
                    hasChangesRequested && !assetReplacement && "border-orange-500/50",
                    isApproved && "border-green-500/50"
                  )}
                  onClick={() => handleSelectAsset(asset)}
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-square bg-muted">
                    <img
                      src={assetReplacement?.preview || fixBrokenStorageUrl(asset.file_url)}
                      alt={asset.label || 'Asset'}
                      className="w-full h-full object-cover"
                    />
                    
                    {/* Status overlay */}
                    {isApproved && (
                      <div className="absolute top-1 right-1">
                        <CheckCircle className="h-4 w-4 text-green-500 drop-shadow" />
                      </div>
                    )}
                    {hasChangesRequested && (
                      <div className="absolute top-1 right-1">
                        <AlertTriangle className="h-4 w-4 text-orange-500 drop-shadow" />
                      </div>
                    )}
                    
                    {/* Replacement indicator */}
                    {assetReplacement && (
                      <div className="absolute bottom-1 left-1">
                        <Badge variant="default" className="text-[10px] px-1 py-0 bg-blue-500">
                          New
                        </Badge>
                      </div>
                    )}
                  </div>
                  
                  {/* Label */}
                  <div className="p-1.5">
                    <p className="text-xs font-medium truncate">{asset.label || 'Untitled'}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Asset Header with Status */}
        <div className="p-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h4 className="font-medium">{selectedAsset?.label || 'Asset'}</h4>
            {selectedAsset && getAssetStatusBadge(selectedAsset)}
          </div>
          
          {/* Replace button for CHANGES_REQUESTED assets */}
          {showReplaceMode && selectedAsset?.review_status === 'CHANGES_REQUESTED' && (
            <div className="flex items-center gap-2">
              {replacement ? (
                <>
                  <span className="text-xs text-muted-foreground">
                    New file ready
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveReplacement(selectedAsset.id)}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                </>
              ) : (
                <>
                  <Input
                    type="file"
                    accept="image/*,.psd,.ai,.pdf,.tiff"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && selectedAsset) {
                        handleReplaceFile(selectedAsset.id, file);
                      }
                      e.target.value = '';
                    }}
                    className="hidden"
                    id={`replace-${selectedAsset.id}`}
                  />
                  <Label htmlFor={`replace-${selectedAsset.id}`}>
                    <Button variant="outline" size="sm" asChild>
                      <span>
                        <Upload className="h-4 w-4 mr-1" />
                        Replace File
                      </span>
                    </Button>
                  </Label>
                </>
              )}
            </div>
          )}
          
          {/* Show lock for approved assets */}
          {selectedAsset?.review_status === 'APPROVED' && (
            <span className="text-xs text-green-500">
              ✓ Approved - No changes needed
            </span>
          )}
        </div>

        {/* Image + Comments */}
        <div className="flex-1 flex min-h-0">
          {/* Image Viewer */}
          <div className="flex-1">
            <ImageViewer
              ref={imageViewerRef}
              src={displayUrl}
              alt={selectedAsset?.label}
              annotations={enrichedAnnotations}
              selectedAnnotationId={selectedAnnotationId}
              onAnnotationClick={handleAnnotationClick}
              onAnnotationCreate={() => {}} // Read-only, no creation
              isDrawing={false}
              showAnnotations={showAnnotations}
              onToggleAnnotations={() => setShowAnnotations(!showAnnotations)}
              readOnly={true}
            />
          </div>

          {/* Thread Panel (read + reply) */}
          <div className="w-72">
            <ThreadPanel
              submissionId={submissionId}
              threads={assetThreads}
              annotations={enrichedAnnotations}
              selectedAnnotationId={selectedAnnotationId}
              selectedAssetId={selectedAsset?.id || null}
              onSelectAnnotation={handleSelectAnnotation}
              onJumpToAnnotation={handleJumpToAnnotation}
              isInternal={false} // Freelancer view - no internal controls
            />
          </div>
        </div>
      </div>
    </div>
  );
}
