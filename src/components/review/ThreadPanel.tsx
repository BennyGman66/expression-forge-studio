import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  MessageSquare,
  Send,
  Lock,
  Target,
  Pencil,
  Image,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import type { ReviewThread, ReviewComment, ImageAnnotation, ThreadScope } from '@/types/review';
import { useAddComment, useCreateThread } from '@/hooks/useReviewSystem';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type CommentMode = 'annotate' | 'comment';

interface ThreadPanelProps {
  submissionId: string;
  threads: ReviewThread[];
  annotations: ImageAnnotation[];
  selectedAnnotationId: string | null;
  selectedAssetId: string | null;
  onSelectAnnotation: (annotationId: string | null) => void;
  onJumpToAnnotation?: (annotationId: string) => void;
  isInternal: boolean;
  isDrawing?: boolean;
  onToggleDrawing?: () => void;
  pendingAnnotationId?: string | null;
  showGeneralCommentInput?: boolean;
  supersededAssetIds?: string[]; // Asset IDs that have been replaced by newer versions
}

export function ThreadPanel({
  submissionId,
  threads,
  annotations,
  selectedAnnotationId,
  selectedAssetId,
  onSelectAnnotation,
  onJumpToAnnotation,
  isInternal,
  isDrawing = false,
  onToggleDrawing,
  pendingAnnotationId,
  showGeneralCommentInput = false,
  supersededAssetIds = [],
}: ThreadPanelProps) {
  const { user } = useAuth();
  const [newComment, setNewComment] = useState('');
  const [isInternalOnly, setIsInternalOnly] = useState(false);
  const [commentMode, setCommentMode] = useState<CommentMode>('annotate');
  const [pendingAttachment, setPendingAttachment] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addComment = useAddComment();
  const createThread = useCreateThread();

  // Build a flat list of all comments with annotation context (Frame.io style)
  // For non-internal users, only show SHARED comments
  // Filter out comments from superseded assets (V1 when V2 exists)
  const allComments = useMemo(() => {
    const comments: Array<{
      comment: ReviewComment;
      thread: ReviewThread;
      annotationIndex: number | null;
      annotationId: string | null;
    }> = [];

    threads.forEach(thread => {
      // Skip threads attached to superseded assets (V1 feedback when V2 exists)
      if (thread.asset_id && supersededAssetIds.includes(thread.asset_id)) {
        return;
      }

      const annotationIndex = thread.annotation_id 
        ? annotations.findIndex(a => a.id === thread.annotation_id)
        : null;

      thread.comments?.forEach(comment => {
        // Filter internal comments for non-internal users
        if (!isInternal && comment.visibility === 'INTERNAL_ONLY') {
          return;
        }
        
        comments.push({
          comment,
          thread,
          annotationIndex: annotationIndex !== null && annotationIndex >= 0 ? annotationIndex : null,
          annotationId: thread.annotation_id,
        });
      });
    });

    // Sort chronologically
    return comments.sort((a, b) => 
      new Date(a.comment.created_at).getTime() - new Date(b.comment.created_at).getTime()
    );
  }, [threads, annotations, isInternal, supersededAssetIds]);

  // Find thread for selected annotation
  const selectedAnnotationThread = threads.find(
    t => t.annotation_id === selectedAnnotationId
  );

  // Find or get asset-scoped thread for general comments
  const assetThread = useMemo(() => {
    if (!selectedAssetId) return null;
    return threads.find(t => t.scope === 'ASSET' && t.asset_id === selectedAssetId);
  }, [threads, selectedAssetId]);

  // Handle pasting images from clipboard
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          setPendingAttachment(file);
          const url = URL.createObjectURL(file);
          setAttachmentPreview(url);
        }
        break;
      }
    }
  }, []);

  // Handle file input change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setPendingAttachment(file);
      const url = URL.createObjectURL(file);
      setAttachmentPreview(url);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Clear attachment
  const clearAttachment = useCallback(() => {
    if (attachmentPreview) {
      URL.revokeObjectURL(attachmentPreview);
    }
    setPendingAttachment(null);
    setAttachmentPreview(null);
  }, [attachmentPreview]);

  // Upload attachment to storage
  const uploadAttachment = async (file: File): Promise<string | null> => {
    const fileExt = file.name.split('.').pop() || 'png';
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const filePath = `${submissionId}/${fileName}`;

    const { error } = await supabase.storage
      .from('comment-attachments')
      .upload(filePath, file, { 
        contentType: file.type,
        upsert: false 
      });

    if (error) {
      console.error('Upload error:', error);
      throw error;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('comment-attachments')
      .getPublicUrl(filePath);

    return publicUrl;
  };

  const handleSendComment = async () => {
    const hasContent = newComment.trim() || pendingAttachment;
    if (!hasContent) return;

    setIsUploading(true);
    try {
      let attachmentUrl: string | null = null;
      
      // Upload attachment if exists
      if (pendingAttachment) {
        attachmentUrl = await uploadAttachment(pendingAttachment);
      }

      let threadId: string | null = null;

      // Determine which thread to use based on mode
      if (commentMode === 'annotate' && selectedAnnotationThread) {
        // Use annotation thread
        threadId = selectedAnnotationThread.id;
      } else if (commentMode === 'comment' && selectedAssetId) {
        // Use or create asset-scoped thread for general comments
        if (assetThread) {
          threadId = assetThread.id;
        } else {
          // Create new asset-scoped thread
          const newThread = await createThread.mutateAsync({
            submissionId,
            scope: 'ASSET' as ThreadScope,
            assetId: selectedAssetId,
          });
          threadId = newThread.id;
        }
      } else if (selectedAnnotationThread) {
        // Fallback to annotation thread if available
        threadId = selectedAnnotationThread.id;
      }

      if (!threadId) {
        toast.error('No thread available. Draw an annotation or select Comment mode.');
        return;
      }

      await addComment.mutateAsync({
        threadId,
        body: newComment.trim() || (pendingAttachment ? '(image attached)' : ''),
        visibility: isInternal && isInternalOnly ? 'INTERNAL_ONLY' : 'SHARED',
        attachmentUrl,
      });

      setNewComment('');
      clearAttachment();
      toast.success('Comment sent');
    } catch (error) {
      console.error('Failed to send comment:', error);
      toast.error('Failed to send comment');
    } finally {
      setIsUploading(false);
    }
  };

  // Scroll to bottom when comments change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [allComments.length]);

  // Auto-focus textarea when a new annotation is created
  useEffect(() => {
    if (pendingAnnotationId && textareaRef.current) {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
    }
  }, [pendingAnnotationId]);

  // Sync drawing mode with comment mode
  useEffect(() => {
    if (isDrawing && commentMode !== 'annotate') {
      setCommentMode('annotate');
    }
  }, [isDrawing, commentMode]);

  const handleCommentClick = (annotationId: string | null) => {
    if (annotationId) {
      onSelectAnnotation(annotationId);
      // Just highlight the annotation, don't move the canvas
    }
  };

  const handleModeChange = (value: string) => {
    if (value === 'annotate' || value === 'comment') {
      setCommentMode(value);
      // If switching to annotate mode, optionally enable drawing
      if (value === 'annotate' && onToggleDrawing && !isDrawing) {
        // Don't auto-enable drawing, let user click the draw button
      }
      // If switching to comment mode, disable drawing
      if (value === 'comment' && isDrawing && onToggleDrawing) {
        onToggleDrawing();
      }
    }
  };

  // Clean up object URL on unmount
  useEffect(() => {
    return () => {
      if (attachmentPreview) {
        URL.revokeObjectURL(attachmentPreview);
      }
    };
  }, [attachmentPreview]);

  const canSend = commentMode === 'annotate' 
    ? (!!selectedAnnotationId && (!!newComment.trim() || !!pendingAttachment))
    : (!!selectedAssetId && (!!newComment.trim() || !!pendingAttachment));

  return (
    <div className="flex flex-col h-full border-l border-border bg-card">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">Comments</span>
          <Badge variant="outline" className="ml-auto text-xs">
            {allComments.length}
          </Badge>
        </div>
      </div>

      {/* Unified Comment List (Frame.io style) */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-3 space-y-3">
          {allComments.length > 0 ? (
            allComments.map(({ comment, annotationIndex, annotationId }) => {
              const isInternalComment = comment.visibility === 'INTERNAL_ONLY';
              const isSelected = annotationId === selectedAnnotationId;
              
              return (
                <div
                  key={comment.id}
                  className={cn(
                    "group rounded-lg p-2 transition-colors cursor-pointer",
                    isSelected ? "bg-primary/10" : "hover:bg-muted/50",
                    isInternalComment && "border-l-2 border-yellow-500/50"
                  )}
                  onClick={() => handleCommentClick(annotationId)}
                >
                  {/* Header row: avatar, name, time, annotation badge */}
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6 shrink-0">
                      <AvatarFallback className="text-[10px]">
                        {comment.author?.display_name?.slice(0, 2).toUpperCase() ||
                          comment.author?.email?.slice(0, 2).toUpperCase() ||
                          '??'}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs font-medium truncate">
                      {comment.author?.display_name || comment.author?.email?.split('@')[0] || 'Unknown'}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(comment.created_at), 'MMM d')}
                    </span>
                    
                    {/* Annotation indicator (Frame.io style) */}
                    {annotationIndex !== null && (
                      <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="font-mono">#{annotationIndex + 1}</span>
                        <Target className="h-3 w-3" />
                      </div>
                    )}
                    
                    {/* Internal badge */}
                    {isInternalComment && isInternal && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1 ml-auto">
                        <Lock className="h-2 w-2 mr-0.5" />
                        Internal
                      </Badge>
                    )}
                  </div>
                  
                  {/* Comment body */}
                  <p className="text-sm mt-1.5 pl-8 text-foreground/90">
                    {comment.body}
                  </p>
                  
                  {/* Attachment image */}
                  {comment.attachment_url && (
                    <div className="mt-2 pl-8">
                      <img 
                        src={comment.attachment_url} 
                        alt="Attached reference"
                        className="max-w-[200px] max-h-[150px] rounded border border-border cursor-pointer hover:opacity-90 transition-opacity object-contain bg-muted/30"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(comment.attachment_url!, '_blank');
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No comments yet</p>
              <p className="text-xs mt-1">Draw on the image to add feedback</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Compose Area - Always visible for internal users */}
      <div className="p-3 border-t border-border space-y-2">
        {/* Mode toggle + Internal-only toggle */}
        {isInternal && (
          <div className="flex items-center justify-between gap-2">
            {/* Comment mode toggle */}
            <ToggleGroup 
              type="single" 
              value={commentMode} 
              onValueChange={handleModeChange}
              size="sm"
              className="h-7"
            >
              <ToggleGroupItem value="annotate" className="text-xs h-7 px-2 gap-1">
                <Pencil className="h-3 w-3" />
                Annotate
              </ToggleGroupItem>
              <ToggleGroupItem value="comment" className="text-xs h-7 px-2 gap-1">
                <MessageSquare className="h-3 w-3" />
                Comment
              </ToggleGroupItem>
            </ToggleGroup>
            
            {/* Internal-only toggle */}
            <div className="flex items-center gap-2">
              <Switch
                id="internal-only"
                checked={isInternalOnly}
                onCheckedChange={setIsInternalOnly}
                className="scale-75"
              />
              <Label htmlFor="internal-only" className="text-xs text-muted-foreground flex items-center gap-1">
                <Lock className="h-3 w-3" />
                Internal
              </Label>
            </div>
          </div>
        )}
        
        {/* Comment input with inline controls */}
        {(isInternal || selectedAnnotationId || showGeneralCommentInput) && (
          <>
            {/* Attachment preview */}
            {attachmentPreview && (
              <div className="relative inline-block">
                <img 
                  src={attachmentPreview} 
                  alt="Pending attachment" 
                  className="max-w-[120px] max-h-[80px] rounded border border-border object-contain bg-muted/30"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute -top-2 -right-2 h-5 w-5 rounded-full"
                  onClick={clearAttachment}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
            
            <div className="flex gap-2 items-end">
              <Textarea
                ref={textareaRef}
                placeholder={
                  commentMode === 'annotate'
                    ? isDrawing 
                      ? "Draw on image, then describe..." 
                      : pendingAnnotationId === selectedAnnotationId 
                        ? "Describe the issue..." 
                        : selectedAnnotationId 
                          ? "Reply..." 
                          : "Click draw to annotate..."
                    : "Add a general comment..."
                }
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onPaste={handlePaste}
                className={cn(
                  "min-h-[60px] text-sm resize-none flex-1",
                  pendingAnnotationId === selectedAnnotationId && "ring-2 ring-primary/50"
                )}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleSendComment();
                  }
                }}
              />
              <div className="flex flex-col gap-1">
                {/* Attach image button */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  className="shrink-0 h-8 w-8"
                  title="Attach image (or paste)"
                >
                  <Image className="h-4 w-4" />
                </Button>
                
                {/* Draw icon - only in annotate mode */}
                {isInternal && commentMode === 'annotate' && onToggleDrawing && (
                  <Button
                    variant={isDrawing ? 'default' : 'ghost'}
                    size="icon"
                    onClick={onToggleDrawing}
                    className={cn(
                      "shrink-0 h-8 w-8",
                      isDrawing && "bg-primary text-primary-foreground"
                    )}
                    title="Draw annotation (D)"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  size="icon"
                  onClick={handleSendComment}
                  disabled={!canSend || addComment.isPending || isUploading}
                  className="shrink-0 h-8 w-8"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {commentMode === 'annotate' 
                ? isDrawing 
                  ? 'Click & drag on image to draw' 
                  : selectedAnnotationId 
                    ? '⌘+Enter to send • Paste images with ⌘+V' 
                    : 'Press D to draw'
                : '⌘+Enter to send • Paste images with ⌘+V'
              }
            </p>
          </>
        )}
        
        {/* Hint when no annotation selected - adjusted for internal vs external */}
        {!selectedAnnotationId && !isDrawing && allComments.length > 0 && !showGeneralCommentInput && commentMode === 'annotate' && (
          <p className="text-xs text-muted-foreground text-center py-2">
            Click a comment to view its annotation
          </p>
        )}
        
        {/* Hint for freelancers when no comments exist */}
        {!isInternal && allComments.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">
            No feedback yet on this asset
          </p>
        )}
      </div>
      
      {/* Hidden file input for attachment */}
    </div>
  );
}