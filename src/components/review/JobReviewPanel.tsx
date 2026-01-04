import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { ImageViewer, ImageViewerHandle } from './ImageViewer';
import { ThreadPanel } from './ThreadPanel';
import { AssetThumbnails } from './AssetThumbnails';
import {
  useJobSubmissions,
  useSubmissionAssets,
  useReviewThreads,
  useAssetAnnotations,
  useCreateAnnotation,
  useUpdateSubmissionStatus,
  useCreateNotification,
  useAddComment,
  useCreateThread,
  useCreateSubmission,
} from '@/hooks/useReviewSystem';
import { useJob, useJobOutputs } from '@/hooks/useJobs';
import { useAuth } from '@/contexts/AuthContext';
import { SubmissionAsset, AnnotationRect, SubmissionStatus, ImageAnnotation } from '@/types/review';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  X,
  Check,
  AlertTriangle,
  Pencil,
  Eye,
  User,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Keyboard,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface JobReviewPanelProps {
  jobId: string;
  onClose: () => void;
}

export function JobReviewPanel({ jobId, onClose }: JobReviewPanelProps) {
  const { isInternal, user } = useAuth();
  const imageViewerRef = useRef<ImageViewerHandle>(null);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<SubmissionAsset | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [showChangesDialog, setShowChangesDialog] = useState(false);
  const [changesNote, setChangesNote] = useState('');
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const { data: job, isLoading: jobLoading } = useJob(jobId);
  const { data: submissions = [], refetch: refetchSubmissions } = useJobSubmissions(jobId);
  const { data: jobOutputs = [] } = useJobOutputs(jobId);
  
  const selectedSubmission = submissions.find(s => s.id === selectedVersion) || submissions[0];
  const { data: assets = [] } = useSubmissionAssets(selectedSubmission?.id || null);
  const { data: threads = [] } = useReviewThreads(selectedSubmission?.id || null);
  const { data: annotations = [] } = useAssetAnnotations(selectedAsset?.id || null);

  const createAnnotation = useCreateAnnotation();
  const updateStatus = useUpdateSubmissionStatus();
  const createNotification = useCreateNotification();
  const addComment = useAddComment();
  const createThread = useCreateThread();
  const createSubmission = useCreateSubmission();

  // Build global list of all annotations across all assets for sequential navigation
  const allAnnotations = useMemo(() => {
    const result: { annotationId: string; assetId: string; assetLabel?: string }[] = [];
    assets.forEach(asset => {
      const assetThreads = threads.filter(t => t.asset_id === asset.id && t.scope === 'ANNOTATION');
      assetThreads.forEach(thread => {
        if (thread.annotation_id) {
          result.push({
            annotationId: thread.annotation_id,
            assetId: asset.id,
            assetLabel: asset.label || undefined,
          });
        }
      });
    });
    return result;
  }, [assets, threads]);

  // Find current issue index
  const currentIssueIndex = useMemo(() => {
    if (!selectedAnnotationId) return -1;
    return allAnnotations.findIndex(a => a.annotationId === selectedAnnotationId);
  }, [selectedAnnotationId, allAnnotations]);

  // Navigate to prev/next issue across all assets
  const handleNavigateIssue = useCallback((direction: 'prev' | 'next') => {
    if (allAnnotations.length === 0) return;
    
    let newIndex: number;
    if (currentIssueIndex === -1) {
      newIndex = direction === 'next' ? 0 : allAnnotations.length - 1;
    } else {
      newIndex = direction === 'next' 
        ? Math.min(currentIssueIndex + 1, allAnnotations.length - 1)
        : Math.max(currentIssueIndex - 1, 0);
    }
    
    const target = allAnnotations[newIndex];
    if (!target) return;
    
    // Switch asset if needed
    if (target.assetId !== selectedAsset?.id) {
      const newAsset = assets.find(a => a.id === target.assetId);
      if (newAsset) setSelectedAsset(newAsset);
    }
    
    setSelectedAnnotationId(target.annotationId);
    
    // Scroll to annotation after a brief delay to let the asset switch
    setTimeout(() => {
      imageViewerRef.current?.scrollToAnnotation(target.annotationId);
    }, 100);
  }, [allAnnotations, currentIssueIndex, selectedAsset, assets]);

  // Jump to specific annotation from ThreadPanel
  const handleJumpToAnnotation = useCallback((annotationId: string) => {
    setSelectedAnnotationId(annotationId);
    imageViewerRef.current?.scrollToAnnotation(annotationId);
  }, []);

  // Backfill legacy jobs that were SUBMITTED before the review system
  useEffect(() => {
    const backfillSubmission = async () => {
      if (!job || submissions.length > 0 || jobLoading || isBackfilling) return;
      if (job.status !== 'SUBMITTED' && job.status !== 'NEEDS_CHANGES') return;
      if (jobOutputs.length === 0) return;
      
      setIsBackfilling(true);
      try {
        const assets = jobOutputs.map((output, index) => ({
          fileUrl: output.file_url || '',
          label: output.label || `Output ${index + 1}`,
          sortIndex: index,
        }));
        
        await createSubmission.mutateAsync({
          jobId,
          assets,
          summaryNote: 'Auto-created from legacy submission',
        });
        
        await refetchSubmissions();
      } catch (error) {
        console.error('Failed to backfill submission:', error);
      } finally {
        setIsBackfilling(false);
      }
    };
    
    backfillSubmission();
  }, [job, submissions.length, jobLoading, jobOutputs, jobId]);

  // Auto-select first submission and asset
  useEffect(() => {
    if (submissions.length > 0 && !selectedVersion) {
      setSelectedVersion(submissions[0].id);
    }
  }, [submissions, selectedVersion]);

  useEffect(() => {
    if (assets.length > 0 && !selectedAsset) {
      setSelectedAsset(assets[0]);
    } else if (assets.length > 0 && selectedAsset) {
      // Update selected asset if it's in the new list
      const updated = assets.find(a => a.id === selectedAsset.id);
      if (updated) setSelectedAsset(updated);
      else setSelectedAsset(assets[0]);
    }
  }, [assets, selectedAsset]);

  // Calculate annotation counts per asset
  const annotationCounts = assets.reduce((acc, asset) => {
    const count = threads.filter(t => t.asset_id === asset.id && t.scope === 'ANNOTATION').length;
    acc[asset.id] = count;
    return acc;
  }, {} as Record<string, number>);

  const handleAnnotationCreate = useCallback(async (rect: AnnotationRect) => {
    if (!selectedAsset || !selectedSubmission) return;
    
    try {
      const result = await createAnnotation.mutateAsync({
        assetId: selectedAsset.id,
        rect,
        submissionId: selectedSubmission.id,
      });
      setSelectedAnnotationId(result.annotation.id);
      setIsDrawing(false);
      toast.success('Annotation created. Add a comment below.');
    } catch (error) {
      toast.error('Failed to create annotation');
    }
  }, [selectedAsset, selectedSubmission, createAnnotation]);

  const handleRequestChanges = async () => {
    if (!selectedSubmission || !job) return;

    try {
      // Create a job-level thread if needed and add the note
      let jobThread = threads.find(t => t.scope === 'JOB');
      if (!jobThread) {
        jobThread = await createThread.mutateAsync({
          submissionId: selectedSubmission.id,
          scope: 'JOB',
        });
      }
      
      if (changesNote.trim()) {
        await addComment.mutateAsync({
          threadId: jobThread.id,
          body: changesNote.trim(),
          visibility: 'SHARED',
        });
      }

      // Update submission status
      await updateStatus.mutateAsync({
        submissionId: selectedSubmission.id,
        status: 'CHANGES_REQUESTED',
        jobId,
      });

      // Notify freelancer
      if (job.assigned_user_id) {
        await createNotification.mutateAsync({
          userId: job.assigned_user_id,
          type: 'CHANGES_REQUESTED',
          jobId,
          submissionId: selectedSubmission.id,
        });
      }

      toast.success('Changes requested. Freelancer has been notified.');
      setShowChangesDialog(false);
      setChangesNote('');
    } catch (error) {
      toast.error('Failed to request changes');
    }
  };

  const handleApprove = async () => {
    if (!selectedSubmission || !job) return;

    try {
      await updateStatus.mutateAsync({
        submissionId: selectedSubmission.id,
        status: 'APPROVED',
        jobId,
      });

      // Notify freelancer
      if (job.assigned_user_id) {
        await createNotification.mutateAsync({
          userId: job.assigned_user_id,
          type: 'JOB_APPROVED',
          jobId,
          submissionId: selectedSubmission.id,
        });
      }

      toast.success('Submission approved!');
      setShowApproveDialog(false);
    } catch (error) {
      toast.error('Failed to approve submission');
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const currentIndex = assets.findIndex(a => a.id === selectedAsset?.id);
        if (currentIndex === -1) return;
        
        if (e.key === 'ArrowLeft' && currentIndex > 0) {
          setSelectedAsset(assets[currentIndex - 1]);
          setSelectedAnnotationId(null);
        } else if (e.key === 'ArrowRight' && currentIndex < assets.length - 1) {
          setSelectedAsset(assets[currentIndex + 1]);
          setSelectedAnnotationId(null);
        }
      }
      
      // Issue navigation with [ and ]
      if (e.key === '[') {
        handleNavigateIssue('prev');
      } else if (e.key === ']') {
        handleNavigateIssue('next');
      }
      
      // Toggle drawing with D
      if (e.key === 'd' || e.key === 'D') {
        if (isInternal) setIsDrawing(prev => !prev);
      }
      
      if (e.key === 'Escape') {
        if (isDrawing) setIsDrawing(false);
        else if (selectedAnnotationId) setSelectedAnnotationId(null);
      }
      
      // Show shortcuts with ?
      if (e.key === '?') {
        setShowShortcuts(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [assets, selectedAsset, isDrawing, selectedAnnotationId, handleNavigateIssue, isInternal]);

  const getStatusBadgeStyle = (status: SubmissionStatus) => {
    switch (status) {
      case 'SUBMITTED': return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
      case 'IN_REVIEW': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'CHANGES_REQUESTED': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'APPROVED': return 'bg-green-500/20 text-green-400 border-green-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const isLoading = jobLoading || isBackfilling;
  const noSubmissions = !isLoading && submissions.length === 0 && jobOutputs.length === 0;
  
  if (isLoading || noSubmissions) {
    return (
      <div className="fixed inset-0 bg-background z-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">
            {isLoading ? 'Loading...' : 'No submissions to review'}
          </p>
          <Button variant="ghost" onClick={onClose} className="mt-4">
            Close
          </Button>
        </div>
      </div>
    );
  }

  const currentAssetIndex = assets.findIndex(a => a.id === selectedAsset?.id);

  return (
    <TooltipProvider>
      <div className="fixed inset-0 bg-background z-50 flex flex-col">
        {/* Top Bar */}
        <div className="h-14 border-b border-border bg-card px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
            
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {job?.type?.replace(/_/g, ' ')}
              </Badge>
              <span className="text-sm font-medium">
                {job?.title || `Job ${jobId.slice(0, 8)}`}
              </span>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              <span>
                {selectedSubmission?.submitted_by?.display_name || 
                 selectedSubmission?.submitted_by?.email || 
                 'Unknown'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Keyboard shortcuts help */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setShowShortcuts(prev => !prev)}
                >
                  <Keyboard className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[200px]">
                <div className="text-xs space-y-1">
                  <p><kbd className="px-1 bg-muted rounded">←→</kbd> Navigate assets</p>
                  <p><kbd className="px-1 bg-muted rounded">[]</kbd> Navigate issues</p>
                  <p><kbd className="px-1 bg-muted rounded">D</kbd> Toggle draw mode</p>
                  <p><kbd className="px-1 bg-muted rounded">Esc</kbd> Cancel/deselect</p>
                </div>
              </TooltipContent>
            </Tooltip>
            
            {/* Version Selector */}
            <Select value={selectedVersion || ''} onValueChange={setSelectedVersion}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Version" />
              </SelectTrigger>
              <SelectContent>
                {submissions.map((sub) => (
                  <SelectItem key={sub.id} value={sub.id}>
                    v{sub.version_number}
                    {sub.status === 'APPROVED' && ' ✓'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status Badge */}
            <Badge 
              variant="outline" 
              className={getStatusBadgeStyle(selectedSubmission?.status || 'SUBMITTED')}
            >
              {selectedSubmission?.status?.replace('_', ' ')}
            </Badge>

            {/* Actions */}
            {isInternal && selectedSubmission?.status !== 'APPROVED' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowChangesDialog(true)}
                  className="gap-1"
                >
                  <AlertTriangle className="h-4 w-4" />
                  Request Changes
                </Button>
                <Button
                  size="sm"
                  variant="glow"
                  onClick={() => setShowApproveDialog(true)}
                  className="gap-1"
                >
                  <Check className="h-4 w-4" />
                  Approve
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex min-h-0">
          {/* Left: Asset Thumbnails */}
          <div className="w-24 border-r border-border bg-muted/30 shrink-0">
            <AssetThumbnails
              assets={assets}
              selectedAssetId={selectedAsset?.id || null}
              onSelect={(asset) => {
                setSelectedAsset(asset);
                setSelectedAnnotationId(null);
              }}
              annotationCounts={annotationCounts}
            />
          </div>

          {/* Center: Image Viewer */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Asset Navigation */}
            <div className="h-10 border-b border-border bg-card/50 px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={currentAssetIndex <= 0}
                  onClick={() => {
                    if (currentAssetIndex > 0) {
                      setSelectedAsset(assets[currentAssetIndex - 1]);
                      setSelectedAnnotationId(null);
                    }
                  }}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  {selectedAsset?.label || `Asset ${currentAssetIndex + 1}`}
                  <span className="text-muted-foreground ml-2">
                    ({currentAssetIndex + 1}/{assets.length})
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={currentAssetIndex >= assets.length - 1}
                  onClick={() => {
                    if (currentAssetIndex < assets.length - 1) {
                      setSelectedAsset(assets[currentAssetIndex + 1]);
                      setSelectedAnnotationId(null);
                    }
                  }}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {isInternal && (
                <Button
                  variant={isDrawing ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setIsDrawing(!isDrawing)}
                  className="gap-1"
                >
                  <Pencil className="h-3 w-3" />
                  {isDrawing ? 'Drawing...' : 'Draw Annotation'}
                </Button>
              )}
            </div>

            {/* Image Viewer */}
            {selectedAsset?.file_url ? (
              <ImageViewer
                ref={imageViewerRef}
                src={selectedAsset.file_url}
                alt={selectedAsset.label || 'Asset'}
                annotations={annotations}
                selectedAnnotationId={selectedAnnotationId}
                onAnnotationClick={(ann) => setSelectedAnnotationId(ann.id)}
                onAnnotationCreate={handleAnnotationCreate}
                isDrawing={isDrawing}
                showAnnotations={showAnnotations}
                onToggleAnnotations={() => setShowAnnotations(!showAnnotations)}
                className="flex-1"
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                No image available
              </div>
            )}
          </div>

          {/* Right: Comments Panel */}
          <div className="w-80 shrink-0">
            <ThreadPanel
              submissionId={selectedSubmission?.id || ''}
              threads={threads}
              annotations={annotations}
              selectedAnnotationId={selectedAnnotationId}
              selectedAssetId={selectedAsset?.id || null}
              onSelectAnnotation={setSelectedAnnotationId}
              onJumpToAnnotation={handleJumpToAnnotation}
              isInternal={isInternal}
              allAnnotations={allAnnotations}
              currentIssueIndex={currentIssueIndex}
              onNavigateIssue={handleNavigateIssue}
            />
          </div>
        </div>

        {/* Request Changes Dialog */}
        <AlertDialog open={showChangesDialog} onOpenChange={setShowChangesDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Request Changes</AlertDialogTitle>
              <AlertDialogDescription>
                The freelancer will be notified and can view your annotations and comments.
                Add a summary of what needs to be changed:
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Textarea
              placeholder="Describe the changes needed..."
              value={changesNote}
              onChange={(e) => setChangesNote(e.target.value)}
              className="min-h-[100px]"
            />
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRequestChanges}
                disabled={updateStatus.isPending}
              >
                Request Changes
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Approve Dialog */}
        <AlertDialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Approve Submission</AlertDialogTitle>
              <AlertDialogDescription>
                This will mark the submission as approved and notify the freelancer.
                The job will move to the approved state.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleApprove}
                disabled={updateStatus.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                Approve
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
