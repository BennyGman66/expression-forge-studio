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
  useUpdateAssetStatus,
  useCreateNotification,
  useAddComment,
  useCreateThread,
  useCreateSubmission,
} from '@/hooks/useReviewSystem';
import { useJob, useJobOutputs } from '@/hooks/useJobs';
import { useAuth } from '@/contexts/AuthContext';
import { SubmissionAsset, AnnotationRect, SubmissionStatus, ImageAnnotation, AssetReviewStatus } from '@/types/review';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  X,
  Check,
  AlertTriangle,
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
  const [pendingAnnotationId, setPendingAnnotationId] = useState<string | null>(null);
  const [showChangesDialog, setShowChangesDialog] = useState(false);
  
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const { data: job, isLoading: jobLoading } = useJob(jobId);
  const { data: submissions = [], refetch: refetchSubmissions } = useJobSubmissions(jobId);
  const { data: jobOutputs = [] } = useJobOutputs(jobId);
  
  const latestSubmission = submissions[0];
  const selectedSubmission = submissions.find(s => s.id === selectedVersion) || latestSubmission;
  const isViewingSuperseded = selectedSubmission && latestSubmission && 
    selectedSubmission.version_number < latestSubmission.version_number;
  const { data: assets = [] } = useSubmissionAssets(selectedSubmission?.id || null);
  const { data: threads = [] } = useReviewThreads(selectedSubmission?.id || null);
  const { data: annotations = [] } = useAssetAnnotations(selectedAsset?.id || null);

  const createAnnotation = useCreateAnnotation();
  const updateStatus = useUpdateSubmissionStatus();
  const updateAssetStatus = useUpdateAssetStatus();
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

  // No auto-backfill - submissions are only created when freelancer explicitly submits

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
      const newAnnotationId = result.annotation.id;
      setSelectedAnnotationId(newAnnotationId);
      setPendingAnnotationId(newAnnotationId); // Mark as pending comment
      setIsDrawing(false);
      // Don't show toast - the auto-focus on comment input is clear enough
    } catch (error) {
      toast.error('Failed to create annotation');
    }
  }, [selectedAsset, selectedSubmission, createAnnotation]);

  // Clear pending annotation when a comment is successfully added (via watching threads)
  useEffect(() => {
    if (pendingAnnotationId) {
      const pendingThread = threads.find(t => t.annotation_id === pendingAnnotationId);
      if (pendingThread?.comments && pendingThread.comments.length > 0) {
        setPendingAnnotationId(null);
      }
    }
  }, [threads, pendingAnnotationId]);

  // Per-asset: Request changes on current asset
  const handleRequestChangesAsset = async () => {
    if (!selectedSubmission || !job || !selectedAsset) return;

    try {
      // Create an asset-level thread if needed and add the note
      let assetThread = threads.find(t => t.scope === 'ASSET' && t.asset_id === selectedAsset.id);
      if (!assetThread) {
        assetThread = await createThread.mutateAsync({
          submissionId: selectedSubmission.id,
          scope: 'ASSET',
          assetId: selectedAsset.id,
        });
      }
      

      // Update asset status
      const result = await updateAssetStatus.mutateAsync({
        assetId: selectedAsset.id,
        status: 'CHANGES_REQUESTED',
        submissionId: selectedSubmission.id,
        jobId,
      });

      // Notify freelancer about this specific asset
      if (job.assigned_user_id) {
        await createNotification.mutateAsync({
          userId: job.assigned_user_id,
          type: 'CHANGES_REQUESTED',
          jobId,
          submissionId: selectedSubmission.id,
          metadata: { assetLabel: selectedAsset.label },
        });
      }

      toast.success(`Changes requested for ${selectedAsset.label || 'asset'}`);
      setShowChangesDialog(false);
      
    } catch (error) {
      toast.error('Failed to request changes');
    }
  };

  // Per-asset: Approve current asset
  const handleApproveAsset = async () => {
    if (!selectedSubmission || !job || !selectedAsset) return;

    try {
      const result = await updateAssetStatus.mutateAsync({
        assetId: selectedAsset.id,
        status: 'APPROVED',
        submissionId: selectedSubmission.id,
        jobId,
      });

      if (result.allApproved) {
        // Notify freelancer that entire job is approved
        if (job.assigned_user_id) {
          await createNotification.mutateAsync({
            userId: job.assigned_user_id,
            type: 'JOB_APPROVED',
            jobId,
            submissionId: selectedSubmission.id,
          });
        }
        toast.success('All assets approved! Job complete.');
      } else {
        toast.success(`${selectedAsset.label || 'Asset'} approved`);
      }
      
      setShowApproveDialog(false);
    } catch (error) {
      toast.error('Failed to approve asset');
    }
  };

  // Get overall submission progress
  const reviewProgress = useMemo(() => {
    const total = assets.length;
    const approved = assets.filter(a => a.review_status === 'APPROVED').length;
    const changesRequested = assets.filter(a => a.review_status === 'CHANGES_REQUESTED').length;
    const pending = total - approved - changesRequested;
    return { total, approved, changesRequested, pending };
  }, [assets]);

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

          </div>

          <div className="flex items-center gap-3">
            {/* Version Selector - only show when multiple versions */}
            {submissions.length > 1 && (
              <Select value={selectedVersion || ''} onValueChange={setSelectedVersion}>
                <SelectTrigger className="w-24 h-8">
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
            )}

            {/* Progress - only show when not all approved */}
            {reviewProgress.approved < reviewProgress.total && (
              <span className="text-xs text-muted-foreground">
                {reviewProgress.approved}/{reviewProgress.total}
              </span>
            )}

            {/* Status Badge */}
            <Badge 
              variant="outline" 
              className={getStatusBadgeStyle(selectedSubmission?.status || 'SUBMITTED')}
            >
              {selectedSubmission?.status?.replace('_', ' ')}
            </Badge>

            {/* Superseded Version Banner */}
            {isViewingSuperseded && (
              <Badge variant="outline" className="bg-muted text-muted-foreground border-muted-foreground/30">
                Historical v{selectedSubmission?.version_number} — v{latestSubmission?.version_number} is current
              </Badge>
            )}

            {/* Per-Asset Actions - disabled on superseded versions */}
            {isInternal && selectedAsset && selectedAsset.review_status !== 'APPROVED' && !isViewingSuperseded && (
              <>
                <div className="h-4 w-px bg-border" />
                <span className="text-xs text-muted-foreground">
                  {selectedAsset.label || 'Asset'}:
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowChangesDialog(true)}
                  className="gap-1"
                  disabled={updateAssetStatus.isPending}
                >
                  <AlertTriangle className="h-4 w-4" />
                  Request Changes
                </Button>
                <Button
                  size="sm"
                  variant="glow"
                  onClick={() => setShowApproveDialog(true)}
                  className="gap-1"
                  disabled={updateAssetStatus.isPending}
                >
                  <Check className="h-4 w-4" />
                  Approve
                </Button>
              </>
            )}
            
            {/* Show locked state for approved assets */}
            {isInternal && selectedAsset?.review_status === 'APPROVED' && (
              <>
                <div className="h-4 w-px bg-border" />
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30 gap-1">
                  <Check className="h-3 w-3" />
                  Approved
                </Badge>
                <span className="text-xs text-muted-foreground">
                  No further action needed
                </span>
              </>
            )}
            
            {/* Current asset label - only show if not already in actions */}
            {(!isInternal || !selectedAsset) && (
              <span className="text-sm text-muted-foreground">
                {selectedAsset?.label || 'Asset'}
              </span>
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
            {/* Image Viewer - removed redundant asset navigation bar */}
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
              isDrawing={isDrawing}
              onToggleDrawing={() => setIsDrawing(!isDrawing)}
              pendingAnnotationId={pendingAnnotationId}
            />
          </div>
        </div>

        {/* Request Changes Dialog */}
        <AlertDialog open={showChangesDialog} onOpenChange={setShowChangesDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Request Changes</AlertDialogTitle>
              <AlertDialogDescription>
                The freelancer will see your comments and annotations for this asset.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRequestChangesAsset}
                disabled={updateAssetStatus.isPending}
              >
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Approve Dialog */}
        <AlertDialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Approve Asset</AlertDialogTitle>
              <AlertDialogDescription>
                {reviewProgress.pending === 1 && reviewProgress.changesRequested === 0 ? (
                  "This is the last asset. Approving it will complete the entire job."
                ) : (
                  `${reviewProgress.pending - 1} more asset${reviewProgress.pending - 1 === 1 ? '' : 's'} to review after this.`
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleApproveAsset}
                disabled={updateAssetStatus.isPending}
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
