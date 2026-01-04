import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  MessageSquare,
  Send,
  Lock,
  CornerDownRight,
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
  isInternal: boolean;
}

export function ThreadPanel({
  submissionId,
  threads,
  annotations,
  selectedAnnotationId,
  selectedAssetId,
  onSelectAnnotation,
  isInternal,
}: ThreadPanelProps) {
  const { user } = useAuth();
  const [newComment, setNewComment] = useState('');
  const [isInternalOnly, setIsInternalOnly] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'asset' | 'annotations'>('all');
  const scrollRef = useRef<HTMLDivElement>(null);

  const addComment = useAddComment();
  const createThread = useCreateThread();

  // Filter threads based on active tab and selected asset
  const filteredThreads = threads.filter(t => {
    if (activeTab === 'all') return t.scope === 'JOB';
    if (activeTab === 'asset' && selectedAssetId) return t.scope === 'ASSET' && t.asset_id === selectedAssetId;
    if (activeTab === 'annotations') return t.scope === 'ANNOTATION' && t.asset_id === selectedAssetId;
    return false;
  });

  // Find thread for selected annotation
  const selectedAnnotationThread = threads.find(
    t => t.annotation_id === selectedAnnotationId
  );

  // Get the thread to show in detail
  const activeThread = selectedAnnotationThread || filteredThreads[0];

  const handleSendComment = async () => {
    if (!newComment.trim()) return;

    if (activeThread) {
      // Add to existing thread
      await addComment.mutateAsync({
        threadId: activeThread.id,
        body: newComment.trim(),
        visibility: isInternal && isInternalOnly ? 'INTERNAL_ONLY' : 'SHARED',
      });
    } else if (activeTab === 'all') {
      // Create job-level thread first
      const thread = await createThread.mutateAsync({
        submissionId,
        scope: 'JOB',
      });
      await addComment.mutateAsync({
        threadId: thread.id,
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

  const getInitials = (name: string | null | undefined, email: string | undefined) => {
    if (name) return name.slice(0, 2).toUpperCase();
    if (email) return email.slice(0, 2).toUpperCase();
    return '??';
  };

  return (
    <div className="flex flex-col h-full border-l border-border bg-card">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">Comments</span>
          <Badge variant="secondary" className="ml-auto text-xs">
            {threads.reduce((acc, t) => acc + (t.comments?.length || 0), 0)}
          </Badge>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
            <TabsTrigger value="asset" className="text-xs">Asset</TabsTrigger>
            <TabsTrigger value="annotations" className="text-xs">
              Annotations
              {annotations.length > 0 && (
                <span className="ml-1 text-primary">({annotations.length})</span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Annotation List (when in annotations tab) */}
      {activeTab === 'annotations' && (
        <div className="p-2 border-b border-border bg-muted/30">
          <ScrollArea className="max-h-24">
            <div className="flex gap-1 flex-wrap">
              {annotations.map((ann, idx) => (
                <Button
                  key={ann.id}
                  variant={selectedAnnotationId === ann.id ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => onSelectAnnotation(
                    selectedAnnotationId === ann.id ? null : ann.id
                  )}
                >
                  #{idx + 1}
                </Button>
              ))}
              {annotations.length === 0 && (
                <span className="text-xs text-muted-foreground p-2">
                  No annotations yet. Draw on the image to create one.
                </span>
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
                : activeTab === 'all'
                  ? "Start a conversation about this submission"
                  : "Select an annotation to view comments"
              }
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Compose Area */}
      {(activeTab === 'all' || selectedAnnotationId) && (
        <div className="p-3 border-t border-border space-y-2">
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
              placeholder="Add a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="min-h-[60px] text-sm resize-none"
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
        </div>
      )}
    </div>
  );
}

function CommentBubble({
  comment,
  isCurrentUser,
  isInternal,
}: {
  comment: ReviewComment;
  isCurrentUser: boolean;
  isInternal: boolean;
}) {
  const isInternalComment = comment.visibility === 'INTERNAL_ONLY';

  return (
    <div className={cn(
      "flex gap-2",
      isCurrentUser && "flex-row-reverse"
    )}>
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
