import React, { useState, useRef, useEffect, forwardRef } from 'react';
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
  ChevronLeft,
  ChevronRight,
  Target,
  Pencil,
} from 'lucide-react';
import { format } from 'date-fns';
import { ReviewThread, ReviewComment, ImageAnnotation, CommentVisibility } from '@/types/review';
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
  // Issue navigation
  allAnnotations?: { annotationId: string; assetId: string; assetLabel?: string }[];
  currentIssueIndex?: number;
  onNavigateIssue?: (direction: 'prev' | 'next') => void;
  // Drawing mode controls (moved from ImageViewer header)
  isDrawing?: boolean;
  onToggleDrawing?: () => void;
  // Flag for newly created annotation awaiting comment
  pendingAnnotationId?: string | null;
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
  allAnnotations = [],
  currentIssueIndex = -1,
  onNavigateIssue,
  isDrawing = false,
  onToggleDrawing,
  pendingAnnotationId,
}: ThreadPanelProps) {
  const { user } = useAuth();
  const [newComment, setNewComment] = useState('');
  const [isInternalOnly, setIsInternalOnly] = useState(false);
  // Unified view - no tabs needed
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedAnnotationRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const addComment = useAddComment();
  const createThread = useCreateThread();

  // Get annotation threads for current asset
  const annotationThreads = threads.filter(t => t.scope === 'ANNOTATION' && t.asset_id === selectedAssetId);
  // Get job-level threads
  const jobThreads = threads.filter(t => t.scope === 'JOB');

  // Find thread for selected annotation
  const selectedAnnotationThread = threads.find(
    t => t.annotation_id === selectedAnnotationId
  );

  // Get the thread to show in detail - prioritize selected annotation thread
  const activeThread = selectedAnnotationThread || annotationThreads[0] || jobThreads[0];

  // Total comment count
  const totalComments = threads.reduce((acc, t) => acc + (t.comments?.length || 0), 0);
  const totalIssues = allAnnotations.length;

  const handleSendComment = async () => {
    if (!newComment.trim()) return;

    if (activeThread) {
      // Add to existing thread
      await addComment.mutateAsync({
        threadId: activeThread.id,
        body: newComment.trim(),
        visibility: isInternal && isInternalOnly ? 'INTERNAL_ONLY' : 'SHARED',
      });
    }

    setNewComment('');
  };

  // Scroll to bottom when comments change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeThread?.comments]);

  // Scroll to selected annotation in list
  useEffect(() => {
    if (selectedAnnotationRef.current) {
      selectedAnnotationRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedAnnotationId]);

  // Auto-focus textarea when a new annotation is created (pendingAnnotationId is set)
  useEffect(() => {
    if (pendingAnnotationId && textareaRef.current) {
      // Focus the textarea after a brief delay to ensure render
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
    }
  }, [pendingAnnotationId]);

  const getInitials = (name: string | null | undefined, email: string | undefined) => {
    if (name) return name.slice(0, 2).toUpperCase();
    if (email) return email.slice(0, 2).toUpperCase();
    return '??';
  };

  return (
    <div className="flex flex-col h-full border-l border-border bg-card">
      {/* Header - Simplified */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">Feedback</span>
          {annotations.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {annotations.length} {annotations.length === 1 ? 'issue' : 'issues'}
            </Badge>
          )}
          <Badge variant="outline" className="ml-auto text-xs">
            {totalComments} {totalComments === 1 ? 'comment' : 'comments'}
          </Badge>
        </div>
      </div>

      {/* Issue Navigation */}
      {totalIssues > 0 && onNavigateIssue && (
        <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={currentIssueIndex <= 0}
            onClick={() => onNavigateIssue('prev')}
          >
            <ChevronLeft className="h-3 w-3 mr-1" />
            Prev
          </Button>
          <span className="text-xs text-muted-foreground">
            {currentIssueIndex >= 0 ? `${currentIssueIndex + 1} of ${totalIssues}` : `${totalIssues} issues`}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={currentIssueIndex >= totalIssues - 1}
            onClick={() => onNavigateIssue('next')}
          >
            Next
            <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      )}

      {/* Annotation List */}
      {annotations.length > 0 && (
        <div className="border-b border-border">
          <ScrollArea className="max-h-40">
            <div className="p-2 space-y-1">
              {annotations.map((ann, idx) => {
                const annThread = threads.find(t => t.annotation_id === ann.id);
                const commentCount = annThread?.comments?.length || 0;
                const firstComment = annThread?.comments?.[0];
                const isSelected = selectedAnnotationId === ann.id;
                
                return (
                  <div
                    key={ann.id}
                    ref={isSelected ? selectedAnnotationRef : null}
                    className={cn(
                      "flex items-start gap-2 p-2 rounded-md cursor-pointer transition-colors",
                      isSelected
                        ? "bg-primary/10 border border-primary/30"
                        : "hover:bg-muted/50"
                    )}
                    onClick={() => onSelectAnnotation(isSelected ? null : ann.id)}
                  >
                    <Badge 
                      variant={isSelected ? "default" : "secondary"} 
                      className="shrink-0 text-xs h-5 w-6 justify-center"
                    >
                      #{idx + 1}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 text-xs">
                        <span className="font-medium truncate">
                          {ann.created_by?.display_name || ann.created_by?.email?.split('@')[0] || 'Unknown'}
                        </span>
                        {commentCount > 0 && (
                          <span className="text-muted-foreground">
                            · {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
                          </span>
                        )}
                      </div>
                      {firstComment && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                          {firstComment.body}
                        </p>
                      )}
                    </div>
                    {onJumpToAnnotation && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          onJumpToAnnotation(ann.id);
                        }}
                        title="Jump to annotation"
                      >
                        <Target className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                );
              })}
              {annotations.length === 0 && (
                <div className="text-xs text-muted-foreground p-2 text-center">
                  No annotations yet. Draw on the image to create one.
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Comments Thread */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-3 space-y-4">
          {activeThread?.comments && activeThread.comments.length > 0 ? (
            activeThread.comments.map((comment) => (
              <CommentBubble
                key={comment.id}
                comment={comment}
                isCurrentUser={comment.author_user_id === user?.id}
                isInternal={isInternal}
              />
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {selectedAnnotationId 
                ? "Add a comment about this annotation"
                : "Select an annotation to view comments"
              }
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Compose Area */}
      <div className="p-3 border-t border-border space-y-2">
        {/* Draw Annotation Button - moved here from image viewer header */}
        {isInternal && onToggleDrawing && (
          <Button
            variant={isDrawing ? 'default' : 'outline'}
            size="sm"
            onClick={onToggleDrawing}
            className="w-full gap-2"
          >
            <Pencil className="h-3 w-3" />
            {isDrawing ? 'Drawing... (click & drag on image)' : 'Draw + Comment'}
          </Button>
        )}
        
        {/* Comment input - show when there's a selected annotation */}
        {selectedAnnotationId && (
          <>
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
            <div className="flex gap-2">
              <Textarea
                ref={textareaRef}
                placeholder={pendingAnnotationId === selectedAnnotationId 
                  ? "Describe the issue with this area..." 
                  : "Add a comment..."
                }
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className={cn(
                  "min-h-[60px] text-sm resize-none",
                  pendingAnnotationId === selectedAnnotationId && "ring-2 ring-primary/50"
                )}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleSendComment();
                  }
                }}
              />
              <Button
                size="icon"
                onClick={handleSendComment}
                disabled={!newComment.trim() || addComment.isPending}
                className="shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              ⌘+Enter to send
            </p>
          </>
        )}
        
        {/* Hint when no annotation selected */}
        {!selectedAnnotationId && !isDrawing && (
          <p className="text-xs text-muted-foreground text-center py-2">
            {annotations.length > 0 ? 'Select an issue above or draw a new one' : 'Draw on the image to add feedback'}
          </p>
        )}
      </div>
    </div>
  );
}

interface CommentBubbleProps {
  comment: ReviewComment;
  isCurrentUser: boolean;
  isInternal: boolean;
}

const CommentBubble = forwardRef<HTMLDivElement, CommentBubbleProps>(
  ({ comment, isCurrentUser, isInternal }, ref) => {
    const isInternalComment = comment.visibility === 'INTERNAL_ONLY';

    return (
      <div
        ref={ref}
        className={cn(
          "flex gap-2",
          isCurrentUser && "flex-row-reverse"
        )}
      >
        <Avatar className="h-7 w-7 shrink-0">
          <AvatarFallback className="text-[10px]">
            {comment.author?.display_name?.slice(0, 2).toUpperCase() ||
              comment.author?.email?.slice(0, 2).toUpperCase() ||
              '??'}
          </AvatarFallback>
        </Avatar>
        <div className={cn(
          "flex-1 min-w-0",
          isCurrentUser && "text-right"
        )}>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-xs font-medium">
              {comment.author?.display_name || comment.author?.email || 'Unknown'}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {format(new Date(comment.created_at), 'MMM d, h:mm a')}
            </span>
            {isInternalComment && isInternal && (
              <Badge variant="outline" className="text-[9px] h-4 px-1">
                <Lock className="h-2 w-2 mr-0.5" />
                Internal
              </Badge>
            )}
          </div>
          <div className={cn(
            "mt-1 p-2 rounded-lg text-sm inline-block max-w-full text-left",
            isCurrentUser
              ? "bg-primary text-primary-foreground"
              : isInternalComment
                ? "bg-yellow-500/20 border border-yellow-500/30"
                : "bg-muted"
          )}>
            {comment.body}
          </div>
        </div>
      </div>
    );
  }
);

CommentBubble.displayName = 'CommentBubble';
