import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  MessageSquare,
  Send,
  Lock,
  Target,
  Pencil,
} from 'lucide-react';
import { format } from 'date-fns';
import { ReviewThread, ReviewComment, ImageAnnotation } from '@/types/review';
import { useAddComment, useCreateThread } from '@/hooks/useReviewSystem';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

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
  showGeneralCommentInput?: boolean; // Allow general comments without annotation
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
}: ThreadPanelProps) {
  const { user } = useAuth();
  const [newComment, setNewComment] = useState('');
  const [isInternalOnly, setIsInternalOnly] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const addComment = useAddComment();
  const createThread = useCreateThread();

  // Build a flat list of all comments with annotation context (Frame.io style)
  // For non-internal users, only show SHARED comments
  const allComments = useMemo(() => {
    const comments: Array<{
      comment: ReviewComment;
      thread: ReviewThread;
      annotationIndex: number | null;
      annotationId: string | null;
    }> = [];

    threads.forEach(thread => {
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
  }, [threads, annotations, isInternal]);

  // Find thread for selected annotation
  const selectedAnnotationThread = threads.find(
    t => t.annotation_id === selectedAnnotationId
  );

  const handleSendComment = async () => {
    if (!newComment.trim() || !selectedAnnotationThread) return;

    await addComment.mutateAsync({
      threadId: selectedAnnotationThread.id,
      body: newComment.trim(),
      visibility: isInternal && isInternalOnly ? 'INTERNAL_ONLY' : 'SHARED',
    });

    setNewComment('');
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

  const handleCommentClick = (annotationId: string | null) => {
    if (annotationId) {
      onSelectAnnotation(annotationId);
      // Just highlight the annotation, don't move the canvas
    }
  };

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
        {/* Internal-only toggle */}
        {isInternal && (
          <div className="flex items-center gap-2">
            <Switch
              id="internal-only"
              checked={isInternalOnly}
              onCheckedChange={setIsInternalOnly}
              className="scale-75"
            />
            <Label htmlFor="internal-only" className="text-xs text-muted-foreground flex items-center gap-1">
              <Lock className="h-3 w-3" />
              Internal only
            </Label>
          </div>
        )}
        
        {/* Comment input with inline draw icon */}
        {(isInternal || selectedAnnotationId || showGeneralCommentInput) && (
          <>
            <div className="flex gap-2 items-end">
              <Textarea
                ref={textareaRef}
                placeholder={
                  isDrawing 
                    ? "Draw on image, then describe..." 
                    : pendingAnnotationId === selectedAnnotationId 
                      ? "Describe the issue..." 
                      : selectedAnnotationId 
                        ? "Reply..." 
                        : "Click draw to annotate..."
                }
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
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
                {/* Draw icon - inline next to textarea */}
                {isInternal && onToggleDrawing && (
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
                  disabled={!newComment.trim() || addComment.isPending || !selectedAnnotationId}
                  className="shrink-0 h-8 w-8"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {isDrawing 
                ? 'Click & drag on image to draw' 
                : selectedAnnotationId 
                  ? '⌘+Enter to send' 
                  : 'Press D to draw'}
            </p>
          </>
        )}
        
        {/* Hint when no annotation selected - adjusted for internal vs external */}
        {!selectedAnnotationId && !isDrawing && allComments.length > 0 && !showGeneralCommentInput && (
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
    </div>
  );
}