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
  useJobAssetsWithHistory,
  AssetSlot,
} from '@/hooks/useReviewSystem';
import { useJob, useJobOutputs } from '@/hooks/useJobs';
import { useAuth } from '@/contexts/AuthContext';
import { SubmissionAsset, AnnotationRect, SubmissionStatus, ImageAnnotation, AssetReviewStatus } from '@/types/review';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  X,
  Check,
  AlertTriangle,
  Upload,
  Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { fixBrokenStorageUrl } from '@/lib/fileUtils';
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
  const queryClient = useQueryClient();
  const [selectedAsset, setSelectedAsset] = useState<SubmissionAsset | null>(null);
  const [viewingVersionId, setViewingVersionId] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [pendingAnnotationId, setPendingAnnotationId] = useState<string | null>(null);
  const [showChangesDialog, setShowChangesDialog] = useState(false);
  
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [uploadingAdmin, setUploadingAdmin] = useState(false);
  const adminFileInputRef = useRef<HTMLInputElement>(null);

  const { data: job, isLoading: jobLoading } = useJob(jobId);
  const { data: submissions = [], refetch: refetchSubmissions } = useJobSubmissions(jobId);
  const { data: jobOutputs = [] } = useJobOutputs(jobId);
  
  // Asset-centric: fetch all assets for the job with version history
  const { data: assetSlots = [] } = useJobAssetsWithHistory(jobId);
  
  const latestSubmission = submissions[0];
  // Get all current assets from slots
  const assets = assetSlots.map(slot => slot.current);
  
  // Still need threads from a submission context - use latest
  const { data: threads = [] } = useReviewThreads(latestSubmission?.id || null);
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

  // Auto-select first asset
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

  // Calculate annotation counts per asset (including historical versions)
  const annotationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const slot of assetSlots) {
      // Count for current version
      const currentCount = threads.filter(t => t.asset_id === slot.current.id && t.scope === 'ANNOTATION').length;
      counts[slot.current.id] = currentCount;
      // Count for historical versions
      for (const hist of slot.history) {
        const histCount = threads.filter(t => t.asset_id === hist.id && t.scope === 'ANNOTATION').length;
        counts[hist.id] = histCount;
      }
    }
    return counts;
  }, [assetSlots, threads]);

  // Check if viewing a historical version
  const isViewingHistoricalVersion = viewingVersionId !== null;

  const handleAnnotationCreate = useCallback(async (rect: AnnotationRect) => {
    if (!selectedAsset || !latestSubmission) return;
    
    try {
      const result = await createAnnotation.mutateAsync({
        assetId: selectedAsset.id,
        rect,
        submissionId: latestSubmission.id,
      });
      const newAnnotationId = result.annotation.id;
      setSelectedAnnotationId(newAnnotationId);
      setPendingAnnotationId(newAnnotationId); // Mark as pending comment
      setIsDrawing(false);
      // Don't show toast - the auto-focus on comment input is clear enough
    } catch (error) {
      toast.error('Failed to create annotation');
    }
  }, [selectedAsset, latestSubmission, createAnnotation]);

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
    if (!latestSubmission || !job || !selectedAsset) return;

    try {
      // Create an asset-level thread if needed and add the note
      let assetThread = threads.find(t => t.scope === 'ASSET' && t.asset_id === selectedAsset.id);
      if (!assetThread) {
        assetThread = await createThread.mutateAsync({
          submissionId: latestSubmission.id,
          scope: 'ASSET',
          assetId: selectedAsset.id,
        });
      }
      

      // Update asset status
      const result = await updateAssetStatus.mutateAsync({
        assetId: selectedAsset.id,
        status: 'CHANGES_REQUESTED',
        submissionId: latestSubmission.id,
        jobId,
      });

      // Notify freelancer about this specific asset
      if (job.assigned_user_id) {
        await createNotification.mutateAsync({
          userId: job.assigned_user_id,
          type: 'CHANGES_REQUESTED',
          jobId,
          submissionId: latestSubmission.id,
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
    if (!latestSubmission || !job || !selectedAsset) return;

    try {
      const result = await updateAssetStatus.mutateAsync({
        assetId: selectedAsset.id,
        status: 'APPROVED',
        submissionId: latestSubmission.id,
        jobId,
      });

      if (result.allApproved) {
        // Notify freelancer that entire job is approved
        if (job.assigned_user_id) {
          await createNotification.mutateAsync({
            userId: job.assigned_user_id,
            type: 'JOB_APPROVED',
            jobId,
            submissionId: latestSubmission.id,
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

  // Admin upload handler
  const handleAdminUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !latestSubmission) return;
    
    setUploadingAdmin(true);
    try {
      for (const file of Array.from(files)) {
        // Sanitize filename
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileName = `admin-uploads/${jobId}/${Date.now()}-${safeName}`;
        
        const { error: uploadError } = await supabase.storage
          .from('images')
          .upload(fileName, file);
        
        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage
          .from('images')
          .getPublicUrl(fileName);
        
        // Create submission asset
        const { error: assetError } = await supabase
          .from('submission_assets')
          .insert({
            submission_id: latestSubmission.id,
            file_url: publicUrl,
            label: `Admin: ${file.name}`,
            sort_index: assets.length,
          });
        
        if (assetError) throw assetError;
      }
      
      toast.success(`${files.length} asset(s) added`);
      queryClient.invalidateQueries({ queryKey: ['job-assets-with-history', jobId] });
    } catch (err: any) {
      console.error('Admin upload error:', err);
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploadingAdmin(false);
      // Reset input
      if (adminFileInputRef.current) {
        adminFileInputRef.current.value = '';
      }
    }
  };

  // Detect orphaned outputs (job_outputs exist but no submissions)
  const hasOrphanedOutputs = submissions.length === 0 && jobOutputs.length > 0;

  // Create submission from orphaned outputs
  const handleCreateFromOutputs = async () => {
    if (!jobId || jobOutputs.length === 0) return;
    
    setIsBackfilling(true);
    try {
      // 1. Create job_submission
      const { data: submission, error: subError } = await supabase
        .from('job_submissions')
        .insert({
          job_id: jobId,
          status: 'SUBMITTED',
          version_number: 1,
          summary_note: 'Admin created from uploaded outputs'
        })
        .select()
        .single();
      
      if (subError) throw subError;
      
      // 2. Create submission_assets from job_outputs
      const assetInserts = jobOutputs.map((output, index) => ({
        submission_id: submission.id,
        file_url: output.file_url,
        label: output.label || `Output ${index + 1}`,
        sort_index: index,
      }));
      
      const { error: assetsError } = await supabase
        .from('submission_assets')
        .insert(assetInserts);
        
      if (assetsError) throw assetsError;
      
      // 3. Update job status to SUBMITTED if not already
      await supabase
        .from('unified_jobs')
        .update({ status: 'SUBMITTED' })
        .eq('id', jobId);
      
      toast.success('Submission created - ready for review');
      
      // Refresh data
      refetchSubmissions();
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    } catch (err) {
      console.error('Error creating submission:', err);
      toast.error('Failed to create submission');
    } finally {
      setIsBackfilling(false);
    }
  };

  const isLoading = jobLoading || isBackfilling;
  const noSubmissions = !isLoading && submissions.length === 0 && jobOutputs.length === 0;
  
  // Show orphaned outputs prompt
  if (!isLoading && hasOrphanedOutputs) {
    return (
      <div className="fixed inset-0 bg-background z-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Upload className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-lg font-medium mb-2">Outputs Ready for Review</h2>
          <p className="text-muted-foreground mb-6">
            {jobOutputs.length} file(s) have been uploaded. Create a submission to start reviewing and leave feedback.
          </p>
          <div className="flex gap-2 justify-center">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleCreateFromOutputs} disabled={isBackfilling}>
              {isBackfilling ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Submission'
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }
  
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
            {/* Historical version indicator */}
            {isViewingHistoricalVersion && (
              <Badge variant="outline" className="bg-amber-500/20 text-amber-300 border-amber-500/30">
                Viewing historical version
              </Badge>
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
              className={getStatusBadgeStyle(latestSubmission?.status || 'SUBMITTED')}
            >
              {latestSubmission?.status?.replace('_', ' ')}
            </Badge>

            {/* Per-Asset Actions - disabled when viewing historical version */}
            {isInternal && selectedAsset && selectedAsset.review_status !== 'APPROVED' && !isViewingHistoricalVersion && (
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
            
            {/* Admin Upload Button */}
            {isInternal && !isViewingHistoricalVersion && (
              <>
                <div className="h-4 w-px bg-border" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={uploadingAdmin}
                      onClick={() => adminFileInputRef.current?.click()}
                    >
                      {uploadingAdmin ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      Add Asset
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Upload assets on behalf of freelancer</TooltipContent>
                </Tooltip>
                <input
                  ref={adminFileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleAdminUpload}
                />
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
              assetSlots={assetSlots}
              selectedAssetId={selectedAsset?.id || null}
              onSelect={(asset) => {
                setSelectedAsset(asset);
                setSelectedAnnotationId(null);
              }}
              annotationCounts={annotationCounts}
              viewingVersionId={viewingVersionId}
              onViewVersion={(asset) => {
                if (asset) {
                  setViewingVersionId(asset.id);
                } else {
                  setViewingVersionId(null);
                }
              }}
            />
          </div>

          {/* Center: Image Viewer */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Image Viewer - removed redundant asset navigation bar */}
            {selectedAsset?.file_url ? (
              <ImageViewer
                ref={imageViewerRef}
                src={fixBrokenStorageUrl(selectedAsset.file_url)}
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
              submissionId={latestSubmission?.id || ''}
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
