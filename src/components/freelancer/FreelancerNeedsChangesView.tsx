import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ImageViewer, ImageViewerHandle } from '@/components/review/ImageViewer';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  useSubmissionAssets, 
  useReviewThreads, 
  useAssetAnnotations,
  useAddComment,
} from '@/hooks/useReviewSystem';
import { SubmissionAsset, ImageAnnotation, ReviewThread } from '@/types/review';
import { 
  CheckCircle, 
  AlertTriangle, 
  Upload, 
  X, 
  ChevronDown, 
  ChevronRight,
  MessageSquare,
  Target,
  Send,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface JobInput {
  id: string;
  label: string | null;
  artifact?: {
    file_url: string;
    preview_url: string | null;
  };
}

interface FreelancerNeedsChangesViewProps {
  submissionId: string;
  jobId: string;
  versionNumber: number;
  instructions?: string;
  inputs?: JobInput[];
  onReplacementsChange: (replacements: Map<string, { file: File; preview: string }>) => void;
  onResubmit: () => void;
  isResubmitting: boolean;
}

export function FreelancerNeedsChangesView({ 
  submissionId, 
  jobId,
  versionNumber,
  instructions,
  inputs = [],
  onReplacementsChange,
  onResubmit,
  isResubmitting,
}: FreelancerNeedsChangesViewProps) {
  const { data: assets = [] } = useSubmissionAssets(submissionId);
  const { data: threads = [] } = useReviewThreads(submissionId);
  
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [replacements, setReplacements] = useState<Map<string, { file: File; preview: string }>>(new Map());
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [flashingAnnotationId, setFlashingAnnotationId] = useState<string | null>(null);
  const [flashingCommentId, setFlashingCommentId] = useState<string | null>(null);
  
  const imageViewerRef = useRef<ImageViewerHandle>(null);
  const addComment = useAddComment();

  // Sort assets: CHANGES_REQUESTED first, then by comment count
  const sortedAssets = useMemo(() => {
    return [...assets].sort((a, b) => {
      // Priority 1: CHANGES_REQUESTED first
      const aNeeds = a.review_status === 'CHANGES_REQUESTED' ? 0 : 1;
      const bNeeds = b.review_status === 'CHANGES_REQUESTED' ? 0 : 1;
      if (aNeeds !== bNeeds) return aNeeds - bNeeds;
      
      // Priority 2: More comments = higher priority
      const aComments = getAssetCommentCount(a.id);
      const bComments = getAssetCommentCount(b.id);
      return bComments - aComments;
    });
  }, [assets, threads]);

  // Get comment count for an asset (includes annotation-only threads as visual feedback)
  function getAssetCommentCount(assetId: string): number {
    const assetThreads = threads.filter(t => t.asset_id === assetId);
    const textComments = assetThreads.reduce((sum, t) => 
      sum + (t.comments?.filter(c => c.visibility === 'SHARED')?.length || 0), 0);
    // Also count annotation-only threads (no text but has visual feedback)
    const annotationOnlyCount = assetThreads.filter(t => 
      t.annotation_id && (!t.comments || t.comments.filter(c => c.visibility === 'SHARED').length === 0)
    ).length;
    return textComments + annotationOnlyCount;
  }

  // Auto-select first NEEDS_CHANGES asset, or first asset
  useEffect(() => {
    if (sortedAssets.length > 0 && !selectedAssetId) {
      const firstNeedsChanges = sortedAssets.find(a => a.review_status === 'CHANGES_REQUESTED');
      setSelectedAssetId(firstNeedsChanges?.id || sortedAssets[0].id);
    }
  }, [sortedAssets, selectedAssetId]);

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

  // Get ALL threads for the entire submission (not just selected asset) - Frame.io style
  const allThreads = useMemo(() => {
    return threads
      .map(thread => ({
        ...thread,
        comments: thread.comments?.filter(c => c.visibility === 'SHARED'),
      }))
      // Include if has comments OR has an annotation (visual feedback)
      .filter(t => (t.comments?.length || 0) > 0 || t.annotation_id);
  }, [threads]);

  // Build flat list of ALL feedback items across ALL assets (chronological)
  const allFeedbackItems = useMemo(() => {
    const items: Array<{
      type: 'comment' | 'annotation-only';
      comment?: NonNullable<ReviewThread['comments']>[0];
      thread: ReviewThread;
      assetId: string | null;
      assetLabel: string | null;
      annotationId: string | null;
    }> = [];

    allThreads.forEach(thread => {
      const asset = assets.find(a => a.id === thread.asset_id);
      
      if (thread.comments && thread.comments.length > 0) {
        // Threads with actual text comments
        thread.comments.forEach(comment => {
          items.push({
            type: 'comment',
            comment,
            thread,
            assetId: thread.asset_id,
            assetLabel: asset?.label || 'Untitled',
            annotationId: thread.annotation_id || null,
          });
        });
      } else if (thread.annotation_id) {
        // Annotation-only threads (no text but has visual marker)
        items.push({
          type: 'annotation-only',
          thread,
          assetId: thread.asset_id,
          assetLabel: asset?.label || 'Untitled',
          annotationId: thread.annotation_id,
        });
      }
    });

    return items.sort((a, b) => {
      const aTime = a.comment?.created_at || a.thread.created_at;
      const bTime = b.comment?.created_at || b.thread.created_at;
      return new Date(aTime).getTime() - new Date(bTime).getTime();
    });
  }, [allThreads, assets]);

  // Assets needing replacement
  const assetsNeedingReplacement = useMemo(() => {
    return assets.filter(a => a.review_status === 'CHANGES_REQUESTED');
  }, [assets]);

  const requiredCount = assetsNeedingReplacement.length;
  const readyCount = useMemo(() => {
    return assetsNeedingReplacement.filter(a => replacements.has(a.id)).length;
  }, [assetsNeedingReplacement, replacements]);

  const canResubmit = readyCount >= requiredCount && requiredCount > 0;

  const handleSelectAsset = (asset: SubmissionAsset) => {
    setSelectedAssetId(asset.id);
    setSelectedAnnotationId(null);
    setReplyText('');
  };

  const handleAnnotationClick = useCallback((annotation: ImageAnnotation) => {
    setSelectedAnnotationId(annotation.id);
    // Flash the corresponding comment
    const thread = threads.find(t => t.annotation_id === annotation.id);
    if (thread?.comments?.[0]) {
      setFlashingCommentId(thread.comments[0].id);
      setTimeout(() => setFlashingCommentId(null), 600);
    }
  }, [threads]);

  const handleSelectAnnotation = useCallback((annotationId: string | null) => {
    setSelectedAnnotationId(annotationId);
  }, []);

  // Jump to annotation - can switch assets if needed
  const handleJumpToAnnotation = useCallback((annotationId: string, targetAssetId?: string | null) => {
    // If annotation is on a different asset, switch to it first
    if (targetAssetId && targetAssetId !== selectedAssetId) {
      setSelectedAssetId(targetAssetId);
    }
    setSelectedAnnotationId(annotationId);
    setFlashingAnnotationId(annotationId);
    setTimeout(() => setFlashingAnnotationId(null), 600);
    // Only scroll if on same asset (otherwise image isn't loaded yet)
    if (!targetAssetId || targetAssetId === selectedAssetId) {
      imageViewerRef.current?.scrollToAnnotation(annotationId);
    }
  }, [selectedAssetId]);

  // Handle file replacement
  const handleReplaceFile = (assetId: string, file: File) => {
    const preview = URL.createObjectURL(file);
    const newReplacements = new Map(replacements);
    
    const old = newReplacements.get(assetId);
    if (old?.preview) {
      URL.revokeObjectURL(old.preview);
    }
    
    newReplacements.set(assetId, { file, preview });
    setReplacements(newReplacements);
    onReplacementsChange(newReplacements);
  };

  const handleRemoveReplacement = (assetId: string) => {
    const newReplacements = new Map(replacements);
    const old = newReplacements.get(assetId);
    if (old?.preview) {
      URL.revokeObjectURL(old.preview);
    }
    newReplacements.delete(assetId);
    setReplacements(newReplacements);
    onReplacementsChange(newReplacements);
  };

  // Send reply to selected annotation's thread
  const selectedAnnotationThread = allThreads.find(t => t.annotation_id === selectedAnnotationId);
  
  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedAnnotationThread) return;
    
    await addComment.mutateAsync({
      threadId: selectedAnnotationThread.id,
      body: replyText.trim(),
      visibility: 'SHARED',
    });
    
    setReplyText('');
  };

  if (assets.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No assets found for this submission.
      </div>
    );
  }

  const selectedImageUrl = selectedAsset?.file_url || '';
  const replacement = selectedAsset ? replacements.get(selectedAsset.id) : null;
  const displayUrl = replacement?.preview || selectedImageUrl;
  const selectedAssetCommentCount = selectedAsset ? getAssetCommentCount(selectedAsset.id) : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Main Layout */}
      <div className="flex flex-1 min-h-0 gap-1 overflow-hidden">
        {/* Left: Asset Queue - Compact Thumbnails */}
        <div className="w-24 border rounded-lg border-border bg-muted/10 flex flex-col">
          <div className="p-2 border-b border-border">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Assets</p>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-2">
              {sortedAssets.map((asset) => {
                const isSelected = asset.id === selectedAsset?.id;
                const assetReplacement = replacements.get(asset.id);
                const hasChangesRequested = asset.review_status === 'CHANGES_REQUESTED';
                const isApproved = asset.review_status === 'APPROVED';
                const commentCount = getAssetCommentCount(asset.id);
                
                return (
                  <div
                    key={asset.id}
                    className={cn(
                      "relative rounded-md border-2 cursor-pointer transition-all overflow-hidden",
                      isSelected 
                        ? "border-primary ring-2 ring-primary/30" 
                        : "border-transparent hover:border-muted-foreground/50",
                    )}
                    onClick={() => handleSelectAsset(asset)}
                  >
                    {/* Thumbnail - 3:4 aspect ratio for full image visibility */}
                    <div className="relative aspect-[3/4] bg-muted">
                      <img
                        src={assetReplacement?.preview || asset.file_url || ''}
                        alt={asset.label || 'Asset'}
                        className="w-full h-full object-contain"
                      />
                      
                      {/* Status badge overlay - larger and clearer */}
                      <div className="absolute bottom-0 left-0 right-0 p-1">
                        {isApproved && (
                          <div className="flex items-center justify-center gap-1 bg-green-500 text-white rounded px-1.5 py-0.5">
                            <CheckCircle className="h-3 w-3" />
                            <span className="text-[10px] font-semibold">Approved</span>
                          </div>
                        )}
                        {hasChangesRequested && !assetReplacement && (
                          <div className="flex items-center justify-center gap-1 bg-orange-500 text-white rounded px-1.5 py-0.5">
                            <AlertTriangle className="h-3 w-3" />
                            <span className="text-[10px] font-semibold">Fix</span>
                          </div>
                        )}
                        {assetReplacement && (
                          <div className="flex items-center justify-center gap-1 bg-blue-500 text-white rounded px-1.5 py-0.5">
                            <CheckCircle className="h-3 w-3" />
                            <span className="text-[10px] font-semibold">Ready</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Comment count pill - top right */}
                      {commentCount > 0 && (
                        <div className="absolute top-1 right-1 flex items-center gap-0.5 bg-background/90 rounded-full px-1 py-0.5 text-[9px] font-medium">
                          <MessageSquare className="h-2.5 w-2.5" />
                          {commentCount}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Center: Image Viewer */}
        <div className="flex-1 flex flex-col min-w-0 border rounded-lg overflow-hidden bg-card">
          {/* Status line above viewer */}
          <div className="px-4 py-2 border-b border-border flex items-center justify-between bg-muted/30">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{selectedAsset?.label || 'Asset'}</span>
              {selectedAssetCommentCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  {selectedAssetCommentCount} annotation{selectedAssetCommentCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            
            {/* Inline upload for selected asset */}
            {selectedAsset?.review_status === 'CHANGES_REQUESTED' && (
              <div className="flex items-center gap-2">
                {replacement ? (
                  <>
                    <span className="text-xs text-blue-500">Replacement ready</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveReplacement(selectedAsset.id)}
                      className="h-7 px-2"
                    >
                      <X className="h-3 w-3 mr-1" />
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
                      id={`replace-inline-${selectedAsset.id}`}
                    />
                    <Label htmlFor={`replace-inline-${selectedAsset.id}`}>
                      <Button variant="outline" size="sm" asChild className="h-7">
                        <span>
                          <Upload className="h-3 w-3 mr-1" />
                          Upload Replacement
                        </span>
                      </Button>
                    </Label>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Image Viewer */}
          <div className="flex-1 min-h-0">
            <ImageViewer
              ref={imageViewerRef}
              src={displayUrl}
              alt={selectedAsset?.label}
              annotations={enrichedAnnotations}
              selectedAnnotationId={selectedAnnotationId}
              flashingAnnotationId={flashingAnnotationId}
              onAnnotationClick={handleAnnotationClick}
              onAnnotationCreate={() => {}}
              isDrawing={false}
              showAnnotations={showAnnotations}
              onToggleAnnotations={() => setShowAnnotations(!showAnnotations)}
              readOnly={true}
            />
          </div>
        </div>

        {/* Right: Actions + Comments */}
        <div className="w-72 border rounded-lg border-border flex flex-col bg-card">
          {/* Actions Panel - Fix Checklist - Only show assets that need changes */}
          {requiredCount > 0 && (
            <div className="p-3 border-b border-border bg-muted/10">
              <div className="space-y-1">
                {assetsNeedingReplacement.map(asset => {
                  const assetReplacement = replacements.get(asset.id);
                  const commentCount = getAssetCommentCount(asset.id);
                  
                  return (
                    <div 
                      key={asset.id} 
                      className={cn(
                        "flex items-center justify-between py-1 px-2 rounded text-sm",
                        assetReplacement ? "bg-blue-500/10" : "bg-orange-500/10"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {assetReplacement ? (
                          <CheckCircle className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                        )}
                        <span className="truncate text-xs">{asset.label || 'Untitled'}</span>
                        {commentCount > 0 && (
                          <span className="text-[10px] text-muted-foreground">({commentCount})</span>
                        )}
                      </div>
                      
                      {!assetReplacement && (
                        <>
                          <Input
                            type="file"
                            accept="image/*,.psd,.ai,.pdf,.tiff"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                handleReplaceFile(asset.id, file);
                              }
                              e.target.value = '';
                            }}
                            className="hidden"
                            id={`replace-checklist-${asset.id}`}
                          />
                          <Label htmlFor={`replace-checklist-${asset.id}`}>
                            <Button variant="ghost" size="sm" asChild className="h-5 px-1.5 text-[10px]">
                              <span>
                                <Upload className="h-3 w-3 mr-0.5" />
                                Upload
                              </span>
                            </Button>
                          </Label>
                        </>
                      )}
                      
                      {assetReplacement && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveReplacement(asset.id)}
                          className="h-5 px-1.5 text-[10px]"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            {/* Progress + Resubmit */}
              <div className="mt-3 pt-2 border-t border-border">
                <p className="text-[10px] text-muted-foreground mb-2">
                  {readyCount}/{requiredCount} replacements ready
                </p>
                <Button 
                  className="w-full" 
                  disabled={!canResubmit || isResubmitting}
                  onClick={onResubmit}
                  size="sm"
                >
                  {isResubmitting ? 'Resubmitting...' : 'Resubmit for Review'}
                </Button>
              </div>
            </div>
          )}

          {/* Comments Panel - Shows ALL feedback from ALL assets */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="p-3 border-b border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Feedback</span>
              </div>
              <Badge variant="outline" className="text-[10px] h-5">
                {allFeedbackItems.length}
              </Badge>
            </div>
            
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2">
                {allFeedbackItems.length > 0 ? (
                  allFeedbackItems.map((item, idx) => {
                    const isOnSelectedAsset = item.assetId === selectedAsset?.id;
                    const annotationIndex = item.annotationId && isOnSelectedAsset
                      ? enrichedAnnotations.findIndex(a => a.id === item.annotationId)
                      : null;
                    const isSelected = item.annotationId === selectedAnnotationId && isOnSelectedAsset;
                    const isFlashing = item.type === 'comment' 
                      ? flashingCommentId === item.comment?.id 
                      : flashingCommentId === item.thread.id;
                    
                    if (item.type === 'annotation-only') {
                      // Annotation-only feedback (visual marker without text)
                      return (
                        <div
                          key={item.thread.id}
                          className={cn(
                            "rounded-lg p-2.5 transition-colors cursor-pointer border",
                            isFlashing && "animate-flash-comment",
                            isSelected 
                              ? "bg-orange-500/10 border-orange-500/30" 
                              : "bg-orange-500/5 border-orange-500/20 hover:bg-orange-500/10"
                          )}
                          onClick={() => {
                            if (item.annotationId) {
                              handleJumpToAnnotation(item.annotationId, item.assetId);
                            }
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <Target className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                            <span className="text-xs font-medium truncate">{item.assetLabel}</span>
                            {annotationIndex !== null && annotationIndex >= 0 && (
                              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                                #{annotationIndex + 1}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1 pl-5">
                            Marked for review
                          </p>
                        </div>
                      );
                    }
                    
                    // Regular comment
                    const comment = item.comment!;
                    return (
                      <div
                        key={comment.id}
                        className={cn(
                          "rounded-lg p-2.5 transition-colors cursor-pointer",
                          isFlashing && "animate-flash-comment",
                          isSelected ? "bg-primary/10" : "hover:bg-muted/50"
                        )}
                        onClick={() => {
                          if (item.annotationId) {
                            handleJumpToAnnotation(item.annotationId, item.assetId);
                          }
                        }}
                      >
                        {/* Asset label as subtle header when not on selected asset */}
                        {!isOnSelectedAsset && (
                          <div className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                            <span className="font-medium">{item.assetLabel}</span>
                            {item.annotationId && <Target className="h-2.5 w-2.5" />}
                          </div>
                        )}
                        
                        <div className="flex items-center gap-2">
                          <Avatar className="h-4 w-4 shrink-0">
                            <AvatarFallback className="text-[8px]">
                              {comment.author?.display_name?.slice(0, 2).toUpperCase() ||
                                comment.author?.email?.slice(0, 2).toUpperCase() ||
                                '??'}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-[11px] font-medium truncate">
                            {comment.author?.display_name || comment.author?.email?.split('@')[0] || 'Reviewer'}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(comment.created_at), 'MMM d')}
                          </span>
                          
                          {isOnSelectedAsset && annotationIndex !== null && annotationIndex >= 0 && (
                            <div className="ml-auto flex items-center gap-0.5 text-[10px] text-muted-foreground">
                              <span className="font-mono">#{annotationIndex + 1}</span>
                              <Target className="h-2.5 w-2.5" />
                            </div>
                          )}
                        </div>
                        
                        <p className="text-xs mt-1 pl-6 text-foreground/90">
                          {comment.body}
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <MessageSquare className="h-6 w-6 mx-auto mb-2 opacity-50" />
                    <p>No feedback yet</p>
                  </div>
                )}
              </div>
            </ScrollArea>
            
            {/* Reply input */}
            {selectedAnnotationId && selectedAnnotationThread && (
              <div className="p-3 border-t border-border">
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Reply to feedback..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="min-h-[60px] text-sm resize-none flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        handleSendReply();
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    onClick={handleSendReply}
                    disabled={!replyText.trim() || addComment.isPending}
                    className="shrink-0 h-8 w-8 self-end"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">⌘+Enter to send</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Instructions + Input Assets - Collapsible at bottom */}
      {(instructions || inputs.length > 0) && (
        <Collapsible open={instructionsOpen} onOpenChange={setInstructionsOpen} className="mt-4">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground">
              {instructionsOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <FileText className="h-4 w-4" />
              <span className="font-medium">Brief / Instructions & Reference Assets</span>
              {!instructionsOpen && instructions && (
                <span className="text-xs truncate max-w-md opacity-60">
                  {instructions.slice(0, 60)}...
                </span>
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-4">
              {/* Text Instructions */}
              {instructions && (
                <div className="p-4 border rounded-lg bg-muted/30 text-sm whitespace-pre-wrap">
                  {instructions}
                </div>
              )}
              
              {/* Reference Input Assets */}
              {inputs.length > 0 && (
                <div className="p-4 border rounded-lg bg-muted/30">
                  <h5 className="text-sm font-medium mb-3">Reference Assets</h5>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                    {inputs.map((input) => (
                      <div key={input.id} className="space-y-1">
                        <div className="aspect-[3/4] bg-muted rounded-md overflow-hidden border border-border">
                          <img
                            src={input.artifact?.preview_url || input.artifact?.file_url || ''}
                            alt={input.label || 'Reference'}
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground text-center truncate">
                          {input.label || 'Reference'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
