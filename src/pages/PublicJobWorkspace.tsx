import { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useFreelancerIdentity } from '@/hooks/useFreelancerIdentity';
import { usePublicJobById, usePublicJobInputs, usePublicJobOutputs, usePublicJobNotes, usePublicLatestSubmission } from '@/hooks/usePublicJob';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeFileName } from '@/lib/fileUtils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Download, Upload, Send, Clock, CheckCircle, Play, FileImage, AlertTriangle, X, FileText, User, ArrowLeft, Eye, RotateCcw, Trash2, MessageSquare, Plus, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { FreelancerNamePrompt } from '@/components/freelancer/FreelancerNamePrompt';
import { FreelancerNeedsChangesView } from '@/components/freelancer/FreelancerNeedsChangesView';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { JOB_TYPE_CONFIG } from '@/lib/jobTypes';

interface PendingUpload {
  id: string;
  file: File;
  view: 'front' | 'side' | 'back' | 'other' | null;
  preview: string;
}

interface GroupedInput {
  view: string;
  headRender?: {
    id: string;
    label: string | null;
    artifact?: {
      file_url: string;
      preview_url: string | null;
    };
  };
  originalSource?: {
    id: string;
    label: string | null;
    artifact?: {
      file_url: string;
      preview_url: string | null;
    };
  };
}

export default function PublicJobWorkspace() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const { identity, setIdentity, hasIdentity, isLoading: identityLoading } = useFreelancerIdentity();
  const { data: job, isLoading: jobLoading, error: jobError } = usePublicJobById(jobId);
  const { data: inputs = [] } = usePublicJobInputs(jobId);
  const { data: outputs = [], refetch: refetchOutputs } = usePublicJobOutputs(jobId);
  const { data: notes = [] } = usePublicJobNotes(jobId);
  const { data: latestSubmission } = usePublicLatestSubmission(jobId);

  const [noteText, setNoteText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [identitySaving, setIdentitySaving] = useState(false);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const [replacements, setReplacements] = useState<Map<string, { file: File; preview: string }>>(new Map());
  const [needsChangesMode, setNeedsChangesMode] = useState<'review' | 'upload'>('review');

  // Group inputs by view for Foundation Face Replace jobs
  const groupedInputs = useMemo(() => {
    if (job?.type !== 'FOUNDATION_FACE_REPLACE') return null;
    
    const groups: Record<string, GroupedInput> = {};
    
    inputs.forEach((input: any) => {
      const label = input.label?.toLowerCase() || '';
      let view = '';
      let isHead = false;
      
      if (label.includes('front')) view = 'Front';
      else if (label.includes('side')) view = 'Side';
      else if (label.includes('back')) view = 'Back';
      
      if (label.includes('head') || label.includes('render')) isHead = true;
      
      if (view) {
        if (!groups[view]) {
          groups[view] = { view };
        }
        if (isHead) {
          groups[view].headRender = input;
        } else {
          groups[view].originalSource = input;
        }
      }
    });
    
    return Object.values(groups).sort((a, b) => {
      const order = { Front: 0, Side: 1, Back: 2 };
      return (order[a.view as keyof typeof order] || 0) - (order[b.view as keyof typeof order] || 0);
    });
  }, [inputs, job?.type]);

  const recommendedOutputs = job?.type === 'FOUNDATION_FACE_REPLACE' ? 3 : 1;
  const uploadProgress = outputs.length > 0 ? Math.min(100, Math.round((outputs.length / recommendedOutputs) * 100)) : 0;

  // Handle claim job for preview mode
  const claimJob = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('unified_jobs')
        .update({ 
          status: 'IN_PROGRESS',
          freelancer_identity_id: identity?.id,
          started_at: new Date().toISOString()
        })
        .eq('id', jobId)
        .eq('status', 'OPEN')
        .is('freelancer_identity_id', null)
        .select()
        .single();
      
      if (error) throw error;
      if (!data) throw new Error('Job is no longer available - it may have been claimed by someone else');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-job-by-id', jobId] });
      toast.success('Job claimed! You can now start working.');
    },
    onError: (error: any) => {
      queryClient.invalidateQueries({ queryKey: ['public-job-by-id', jobId] });
      toast.error(error.message || 'Failed to claim job');
    },
  });

  // Abandon job mutation - returns job to OPEN status
  const abandonJob = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('unified_jobs')
        .update({ 
          status: 'OPEN',
          freelancer_identity_id: null,
          started_at: null
        })
        .eq('id', jobId)
        .eq('freelancer_identity_id', identity?.id)
        .in('status', ['IN_PROGRESS', 'NEEDS_CHANGES'])
        .select()
        .single();
      
      if (error) throw error;
      if (!data) throw new Error('Cannot return this job');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-job-by-id', jobId] });
      queryClient.invalidateQueries({ queryKey: ['public-freelancer-jobs'] });
      toast.success('Job returned to pool. Another freelancer can now claim it.');
      navigate('/work');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to return job');
    },
  });

  // Mutations
  const updateJobStatus = useMutation({
    mutationFn: async ({ status }: { status: 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'SUBMITTED' | 'NEEDS_CHANGES' | 'APPROVED' | 'CLOSED' }) => {
      const { error } = await supabase
        .from('unified_jobs')
        .update({ status })
        .eq('id', job?.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-job-by-id', jobId] });
    },
  });

  const addNote = useMutation({
    mutationFn: async ({ body }: { body: string }) => {
      const { error } = await supabase
        .from('job_notes')
        .insert({
          job_id: job?.id!,
          body,
          // Note: author_id will be null for public access, but we track via freelancer_identity
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-job-notes', job?.id] });
      setNoteText('');
      toast.success('Note added');
    },
  });

  const createSubmission = useMutation({
    mutationFn: async () => {
      // Create submission
      const { data: submission, error: subError } = await supabase
        .from('job_submissions')
        .insert({
          job_id: job?.id!,
          freelancer_identity_id: identity?.id,
          status: 'SUBMITTED' as const,
        })
        .select()
        .single();
      
      if (subError) throw subError;

      // Create submission assets from outputs
      const assets = outputs.map((output: any, index: number) => ({
        submission_id: submission.id,
        file_url: output.file_url || output.artifact?.file_url,
        label: output.label || `Output ${index + 1}`,
        sort_index: index,
        freelancer_identity_id: identity?.id,
      }));

      const { error: assetError } = await supabase
        .from('submission_assets')
        .insert(assets);

      if (assetError) throw assetError;

      // Update job status
      const { error: statusError } = await supabase
        .from('unified_jobs')
        .update({ status: 'SUBMITTED' })
        .eq('id', job?.id);

      if (statusError) {
        console.error('Failed to update job status:', statusError);
        throw new Error('Failed to update job status');
      }

      return submission;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-job-by-id', jobId] });
      queryClient.invalidateQueries({ queryKey: ['public-latest-submission', jobId] });
      toast.success('Job submitted for review!');
    },
  });

  // Resubmit mutation for NEEDS_CHANGES jobs - carries forward approved assets
  const resubmitJob = useMutation({
    mutationFn: async () => {
      if (!latestSubmission?.id) throw new Error('No submission to resubmit');
      
      // Create a new submission with incremented version number
      const { data: newSubmission, error: subError } = await supabase
        .from('job_submissions')
        .insert({
          job_id: job?.id!,
          freelancer_identity_id: identity?.id,
          status: 'SUBMITTED' as const,
          version_number: (latestSubmission.version_number || 1) + 1,
        })
        .select()
        .single();
      
      if (subError) throw subError;
      
      // Fetch all current assets from previous submission (not already superseded)
      const { data: previousAssets, error: fetchError } = await supabase
        .from('submission_assets')
        .select('*')
        .eq('submission_id', latestSubmission.id)
        .is('superseded_by', null);
      
      if (fetchError) throw fetchError;
      
      const newAssets: Array<{
        submission_id: string;
        file_url: string;
        label: string;
        sort_index: number;
        freelancer_identity_id: string;
        review_status?: string;
        reviewed_by_user_id?: string;
        reviewed_at?: string;
      }> = [];
      
      // Process each previous asset
      for (const asset of previousAssets || []) {
        const hasReplacement = replacements.has(asset.id);
        
        if (asset.review_status === 'APPROVED' && !hasReplacement) {
          // Carry forward approved assets to new submission (preserve approval status)
          newAssets.push({
            submission_id: newSubmission.id,
            file_url: asset.file_url!,
            label: asset.label || '',
            sort_index: asset.sort_index,
            freelancer_identity_id: identity?.id!,
            review_status: 'APPROVED',
            reviewed_by_user_id: asset.reviewed_by_user_id || undefined,
            reviewed_at: asset.reviewed_at || undefined,
          });
        } else if (hasReplacement) {
          // Upload replacement file
          const { file } = replacements.get(asset.id)!;
          const safeName = sanitizeFileName(file.name);
          const fileName = `public/${job?.id}/${Date.now()}-resubmit-${safeName}`;
          const { error: uploadError } = await supabase.storage
            .from('images')
            .upload(fileName, file);
          
          if (uploadError) throw uploadError;
          
          const { data: { publicUrl } } = supabase.storage
            .from('images')
            .getPublicUrl(fileName);
          
          newAssets.push({
            submission_id: newSubmission.id,
            file_url: publicUrl,
            label: asset.label || file.name,
            sort_index: asset.sort_index,
            freelancer_identity_id: identity?.id!,
          });
        }
        // Assets with CHANGES_REQUESTED but no replacement are excluded (need to be replaced)
        
        // Mark old asset as superseded
        await supabase
          .from('submission_assets')
          .update({ superseded_by: newSubmission.id })
          .eq('id', asset.id);
      }
      
      // Insert new assets
      if (newAssets.length > 0) {
        const { error: assetError } = await supabase
          .from('submission_assets')
          .insert(newAssets);
        
        if (assetError) throw assetError;
      }
      
      // Update job status back to SUBMITTED
      const { error: statusError } = await supabase
        .from('unified_jobs')
        .update({ status: 'SUBMITTED' })
        .eq('id', job?.id);
      
      if (statusError) throw statusError;
      
      return newSubmission;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-job-by-id', jobId] });
      queryClient.invalidateQueries({ queryKey: ['public-latest-submission', jobId] });
      setReplacements(new Map());
      toast.success('Changes resubmitted for review!');
    },
    onError: (error: any) => {
      console.error('Resubmit error:', error);
      toast.error(error.message || 'Failed to resubmit');
    },
  });

  // Delete output mutation
  const deleteOutput = useMutation({
    mutationFn: async (outputId: string) => {
      const { error } = await supabase
        .from('job_outputs')
        .delete()
        .eq('id', outputId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-job-outputs', jobId] });
    },
    onError: (error: any) => {
      toast.error('Failed to delete output. Please try again.');
      console.error('Delete error:', error);
    },
  });
  const handleIdentitySubmit = async (firstName: string, lastName: string) => {
    setIdentitySaving(true);
    try {
      await setIdentity(firstName, lastName);
    } finally {
      setIdentitySaving(false);
    }
  };

  const handleStartJob = () => {
    updateJobStatus.mutate(
      { status: 'IN_PROGRESS' },
      { onSuccess: () => toast.success('Job started!') }
    );
  };

  const handleSubmitJob = async () => {
    if (outputs.length === 0) {
      toast.error('Please upload at least one output before submitting');
      return;
    }
    // No longer require exactly N outputs - any number >= 1 is fine
    createSubmission.mutate();
  };

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    addNote.mutate({ body: noteText });
  };

  // File handling
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const addFilesToPending = useCallback((files: File[]) => {
    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB per file
    
    console.log('[Upload] addFilesToPending called with', files.length, 'files');
    
    const validFiles = files.filter(file => {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} is too large (max 100MB)`);
        return false;
      }
      return true;
    });
    
    console.log('[Upload] Valid files:', validFiles.length);
    
    // Only show preview for actual image types that browsers can display
    const canPreview = (file: File) => 
      file.type.startsWith('image/') && 
      !file.name.toLowerCase().endsWith('.psd') &&
      !file.name.toLowerCase().endsWith('.ai');
    
    const newUploads: PendingUpload[] = validFiles.map(file => ({
      id: crypto.randomUUID(),
      file,
      view: null,
      preview: canPreview(file) ? URL.createObjectURL(file) : ''
    }));
    
    console.log('[Upload] Created pending uploads:', newUploads.length);
    
    setPendingUploads(prev => {
      console.log('[Upload] Current pending:', prev.length, 'Adding:', newUploads.length);
      return [...prev, ...newUploads];
    });
    
    if (newUploads.length > 0) {
      toast.success(`${newUploads.length} file(s) ready to upload`);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    // Enhanced logging for debugging
    console.log('[Upload] Drop event triggered');
    console.log('[Upload] dataTransfer types:', Array.from(e.dataTransfer.types));
    console.log('[Upload] dataTransfer items count:', e.dataTransfer.items?.length);
    
    let files = Array.from(e.dataTransfer.files);
    console.log('[Upload] Dropped files:', files.length, files.map(f => ({ name: f.name, type: f.type, size: f.size })));
    
    if (files.length === 0) {
      // Try using items API as fallback (works in some browsers like Safari)
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        console.log('[Upload] Trying items API fallback...');
        const itemFiles: File[] = [];
        for (let i = 0; i < e.dataTransfer.items.length; i++) {
          const item = e.dataTransfer.items[i];
          if (item.kind === 'file') {
            const file = item.getAsFile();
            if (file) itemFiles.push(file);
          }
        }
        if (itemFiles.length > 0) {
          console.log('[Upload] Items API recovered files:', itemFiles.length);
          addFilesToPending(itemFiles);
          return;
        }
      }
      
      toast.error('Drag-and-drop failed. Please use the "Browse Files" button instead.', { duration: 5000 });
      return;
    }
    
    addFilesToPending(files);
  }, [addFilesToPending]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('[Upload] File input change triggered');
    const files = e.target.files;
    console.log('[Upload] Files selected:', files?.length, files ? Array.from(files).map(f => f.name) : 'none');
    if (!files?.length) {
      console.log('[Upload] No files to add');
      return;
    }
    addFilesToPending(Array.from(files));
    e.target.value = '';
  };

  const updatePendingView = (fileId: string, view: 'front' | 'side' | 'back' | 'other' | null) => {
    setPendingUploads(prev => prev.map(f => 
      f.id === fileId ? { ...f, view } : f
    ));
  };

  const removePendingFile = (fileId: string) => {
    setPendingUploads(prev => {
      const file = prev.find(f => f.id === fileId);
      if (file?.preview) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter(f => f.id !== fileId);
    });
  };

  const handleUploadPending = async () => {
    if (pendingUploads.length === 0) {
      toast.error('No files to upload');
      return;
    }

    setUploading(true);
    try {
      for (const pending of pendingUploads) {
        const viewLabel = pending.view 
          ? `${pending.view.charAt(0).toUpperCase()}${pending.view.slice(1)} View - `
          : '';
        const safeName = sanitizeFileName(pending.file.name);
        const fileName = `public/${job?.id}/${Date.now()}-${pending.view || 'output'}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from('images')
          .upload(fileName, pending.file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('images')
          .getPublicUrl(fileName);

        await supabase.from('job_outputs').insert({
          job_id: job?.id,
          file_url: publicUrl,
          label: `${viewLabel}${pending.file.name}`,
          freelancer_identity_id: identity?.id,
        });

        if (pending.preview) {
          URL.revokeObjectURL(pending.preview);
        }
      }
      
      setPendingUploads([]);
      refetchOutputs();
      toast.success(`${pendingUploads.length} output(s) uploaded successfully`);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload outputs');
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadAll = async () => {
    toast.info(`Downloading ${inputs.length} files...`);
    
    for (const input of inputs) {
      const url = (input as any).artifact?.file_url;
      if (url) {
        try {
          const response = await fetch(url);
          const blob = await response.blob();
          
          const urlParts = url.split('/');
          const filename = urlParts[urlParts.length - 1] || `input-${(input as any).id}`;
          
          const downloadUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(downloadUrl);
          
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (error) {
          console.error(`Failed to download ${url}:`, error);
        }
      }
    }
    
    toast.success('Downloads complete!');
  };

  // Check which views are already uploaded
  const uploadedViews = useMemo(() => {
    const views = new Set<string>();
    outputs.forEach((output: any) => {
      const label = output.label?.toLowerCase() || '';
      if (label.includes('front')) views.add('front');
      if (label.includes('side')) views.add('side');
      if (label.includes('back')) views.add('back');
    });
    return views;
  }, [outputs]);

  const pendingViews = useMemo(() => {
    const views = new Set<string>();
    pendingUploads.forEach(p => {
      if (p.view) views.add(p.view);
    });
    return views;
  }, [pendingUploads]);

  const pendingWithViews = pendingUploads.filter(f => f.view !== null);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN': return 'bg-blue-500/20 text-blue-400';
      case 'ASSIGNED': return 'bg-cyan-500/20 text-cyan-400';
      case 'IN_PROGRESS': return 'bg-yellow-500/20 text-yellow-400';
      case 'SUBMITTED': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'APPROVED': return 'bg-green-500/20 text-green-400';
      case 'NEEDS_CHANGES': return 'bg-orange-500/20 text-orange-400';
      case 'CLOSED': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'SUBMITTED': return 'IN REVIEW';
      case 'NEEDS_CHANGES': return 'NEEDS CHANGES';
      case 'IN_PROGRESS': return 'IN PROGRESS';
      default: return status;
    }
  };

  const getPriorityBadge = (priority?: number) => {
    if (priority === 1) return <Badge className="bg-red-500/20 text-red-400">URGENT</Badge>;
    return null;
  };

  const getJobTitle = () => {
    return job?.title || job?.type?.replace(/_/g, ' ') || 'Job';
  };

  const getJobTypeBadge = () => {
    if (job?.type === 'FOUNDATION_FACE_REPLACE') return 'Foundation Face Replace';
    return job?.type?.replace(/_/g, ' ') || '';
  };

  // Loading states
  if (identityLoading || jobLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // Invalid or expired link
  if (jobError || !job) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2">Invalid or Expired Link</h1>
          <p className="text-muted-foreground">
            This job link is not valid. Please contact the person who shared this link with you.
          </p>
        </div>
      </div>
    );
  }

  // Show name prompt if no identity
  if (!hasIdentity) {
    return (
      <div className="min-h-screen bg-background">
        <FreelancerNamePrompt 
          open={true} 
          onSubmit={handleIdentitySubmit}
          isLoading={identitySaving}
        />
      </div>
    );
  }

  // Check if this is a preview (OPEN job that hasn't been claimed by this freelancer)
  const isPreviewMode = (job.status === 'OPEN' || job.status === 'ASSIGNED') && 
    job.freelancer_identity_id !== identity?.id;
  
  const isFullyReadOnly = job.status === 'APPROVED' || job.status === 'CLOSED';
  const isReadOnly = job.status === 'SUBMITTED' || isFullyReadOnly || isPreviewMode;
  // Allow uploads for IN_PROGRESS, NEEDS_CHANGES, and SUBMITTED (to update before review completes)
  const canUpload = !isPreviewMode && (job.status === 'IN_PROGRESS' || job.status === 'NEEDS_CHANGES' || job.status === 'SUBMITTED');
  const canStart = job.status === 'OPEN' || job.status === 'ASSIGNED';

  // Get instructions with fallback
  const displayInstructions = job.instructions || 
    JOB_TYPE_CONFIG[job.type as keyof typeof JOB_TYPE_CONFIG]?.defaultInstructions || 
    'No instructions provided';
  return (
    <div className="min-h-screen bg-background">
      {/* Preview Mode Banner */}
      {isPreviewMode && (
        <div className="bg-blue-500/20 border-b border-blue-500/30 px-6 py-3">
          <div className="container mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Eye className="h-5 w-5 text-blue-400" />
              <div>
                <p className="font-medium text-blue-200">Job Preview</p>
                <p className="text-sm text-blue-300/80">
                  Review this job before claiming it. Click "Start Working" to begin.
                </p>
              </div>
            </div>
            <Button 
              onClick={() => claimJob.mutate()}
              disabled={claimJob.isPending}
              className="gap-2"
            >
              <Play className="h-4 w-4" />
              {claimJob.isPending ? 'Claiming...' : 'Start Working'}
            </Button>
          </div>
        </div>
      )}

      {/* Status Banners */}
      {job.status === 'NEEDS_CHANGES' && !isPreviewMode && (
        <div className="bg-orange-500/20 border-b border-orange-500/30 px-6 py-3">
          <div className="container mx-auto flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-400" />
            <div>
              <p className="font-medium text-orange-200">Changes Requested</p>
              <p className="text-sm text-orange-300/80">
                Review the feedback below and update your submission.
              </p>
            </div>
          </div>
        </div>
      )}

      {job.status === 'SUBMITTED' && !isPreviewMode && (
        <div className="bg-purple-500/20 border-b border-purple-500/30 px-6 py-3">
          <div className="container mx-auto flex items-center gap-3">
            <Clock className="h-5 w-5 text-purple-400" />
            <div>
              <p className="font-medium text-purple-200">Submitted - Awaiting Review</p>
              <p className="text-sm text-purple-300/80">
                Your work has been submitted. You'll be notified once it's reviewed.
              </p>
            </div>
          </div>
        </div>
      )}

      {job.status === 'APPROVED' && (
        <div className="bg-green-500/20 border-b border-green-500/30 px-6 py-3">
          <div className="container mx-auto flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-400" />
            <div>
              <p className="font-medium text-green-200">Approved</p>
              <p className="text-sm text-green-300/80">
                Great work! This job has been approved.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/work')} className="gap-1 -ml-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Job Board
            </Button>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              <span>Working as <strong className="text-foreground">{identity?.displayName}</strong></span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-foreground">{getJobTitle()}</h1>
                {getPriorityBadge(job.priority)}
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="text-muted-foreground">
                  {getJobTypeBadge()}
                </Badge>
                <span className="text-muted-foreground text-sm">
                  Created {format(new Date(job.created_at!), 'MMM d, yyyy')}
                  {job.due_date && ` • Due ${format(new Date(job.due_date), 'MMM d, yyyy')}`}
                </span>
              </div>
            </div>
            <Badge className={`${getStatusColor(job.status)} text-sm px-3 py-1`}>
              {getStatusLabel(job.status)}
            </Badge>
          </div>
        </div>
      </header>

      {/* Main Content - Show Feedback View when NEEDS_CHANGES, otherwise show regular content */}
      {job.status === 'NEEDS_CHANGES' && latestSubmission && !isPreviewMode ? (
        <main className="container mx-auto px-6 py-6 flex-1">
          {/* View Toggle Tabs */}
          <div className="flex gap-2 mb-4 border-b border-border pb-3">
            <Button
              variant={needsChangesMode === 'review' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setNeedsChangesMode('review')}
              className="gap-2"
            >
              <MessageSquare className="h-4 w-4" />
              Review Feedback
            </Button>
            <Button
              variant={needsChangesMode === 'upload' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setNeedsChangesMode('upload')}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Add New Outputs
            </Button>
          </div>

          {/* Conditional content based on mode */}
          {needsChangesMode === 'review' ? (
            <div className="h-[calc(100vh-280px)] min-h-[600px]">
              <FreelancerNeedsChangesView
                submissionId={latestSubmission.id}
                jobId={jobId!}
                versionNumber={latestSubmission.version_number || 1}
                instructions={job.instructions}
                inputs={inputs as any}
                onReplacementsChange={setReplacements}
                onResubmit={() => resubmitJob.mutate()}
                isResubmitting={resubmitJob.isPending}
              />
            </div>
          ) : (
            /* Upload mode - shows full upload interface */
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Content */}
              <div className="lg:col-span-2 space-y-6">
                {/* Brief / Instructions */}
                <Accordion type="single" collapsible defaultValue="instructions">
                  <AccordionItem value="instructions" className="border rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        <span className="font-medium">Brief / Instructions</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="pt-2 pb-4 space-y-4">
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {displayInstructions}
                        </p>
                        
                        {/* Input Images Grid */}
                        {inputs.length > 0 && (
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Reference Images</Label>
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                              {inputs.map((input: any) => (
                                <div key={input.id} className="relative group">
                                  <img
                                    src={(input.artifact?.preview_url || input.artifact?.file_url)}
                                    alt={input.label || 'Input'}
                                    className="w-full aspect-square object-cover rounded border border-border"
                                  />
                                  {input.label && (
                                    <span className="absolute bottom-0 left-0 right-0 bg-black/70 text-[10px] text-white px-1 py-0.5 truncate">
                                      {input.label}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                {/* Inputs Section */}
                {groupedInputs && groupedInputs.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <FileImage className="h-5 w-5" />
                          Input Files
                        </CardTitle>
                        <Button variant="outline" size="sm" onClick={handleDownloadAll}>
                          <Download className="h-4 w-4 mr-2" />
                          Download All
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {groupedInputs.map((group) => (
                          <div key={group.view} className="space-y-3">
                            <h4 className="font-medium text-sm">{group.view} View</h4>
                            <div className="space-y-2">
                              {group.headRender && (
                                <div className="space-y-1">
                                  <span className="text-xs text-muted-foreground">Head Render</span>
                                  <div className="relative group">
                                    <img
                                      src={group.headRender.artifact?.preview_url || group.headRender.artifact?.file_url}
                                      alt={`${group.view} head render`}
                                      className="w-full aspect-[3/4] object-cover rounded border border-border"
                                    />
                                    <a
                                      href={group.headRender.artifact?.file_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      <Download className="h-6 w-6 text-white" />
                                    </a>
                                  </div>
                                </div>
                              )}
                              {group.originalSource && (
                                <div className="space-y-1">
                                  <span className="text-xs text-muted-foreground">Original Source</span>
                                  <div className="relative group">
                                    <img
                                      src={group.originalSource.artifact?.preview_url || group.originalSource.artifact?.file_url}
                                      alt={`${group.view} source`}
                                      className="w-full aspect-[3/4] object-cover rounded border border-border"
                                    />
                                    <a
                                      href={group.originalSource.artifact?.file_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      <Download className="h-6 w-6 text-white" />
                                    </a>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Upload Section */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Upload className="h-5 w-5" />
                      Upload New Outputs
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Progress */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Outputs Uploaded</span>
                        <span>{outputs.length} output{outputs.length !== 1 ? 's' : ''}</span>
                      </div>
                      <Progress value={uploadProgress} className="h-2" />
                    </div>

                    {/* Drop Zone */}
                    <div
                      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                        isDragOver ? 'border-primary bg-primary/5' : 'border-border'
                      }`}
                      onDragEnter={handleDragEnter}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                    >
                      <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                      <p className="text-sm font-medium mb-1">Drag & drop files here</p>
                      <p className="text-xs text-muted-foreground mb-3">or click to browse</p>
                      <input
                        type="file"
                        multiple
                        accept="*/*"
                        onChange={handleFileInputChange}
                        className="hidden"
                        id="needs-changes-upload-input"
                      />
                      <Button variant="outline" size="sm" asChild>
                        <label htmlFor="needs-changes-upload-input" className="cursor-pointer">
                          Browse Files
                        </label>
                      </Button>
                    </div>

                    {/* Pending Uploads */}
                    {pendingUploads.length > 0 && (
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Pending Uploads ({pendingUploads.length})</Label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {pendingUploads.map((pending) => (
                            <div key={pending.id} className="relative border rounded-lg p-2 space-y-2">
                              {pending.preview ? (
                                <img
                                  src={pending.preview}
                                  alt={pending.file.name}
                                  className="w-full aspect-square object-cover rounded"
                                />
                              ) : (
                                <div className="w-full aspect-square bg-muted rounded flex items-center justify-center">
                                  <FileImage className="h-8 w-8 text-muted-foreground" />
                                </div>
                              )}
                              <p className="text-xs truncate">{pending.file.name}</p>
                              <Select
                                value={pending.view || ''}
                                onValueChange={(v) => updatePendingView(pending.id, v as any)}
                              >
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue placeholder="Select view" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="front">Front</SelectItem>
                                  <SelectItem value="side">Side</SelectItem>
                                  <SelectItem value="back">Back</SelectItem>
                                  <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-1 right-1 h-6 w-6"
                                onClick={() => removePendingFile(pending.id)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                        <Button
                          onClick={handleUploadPending}
                          disabled={uploading || pendingUploads.length === 0}
                          className="w-full"
                        >
                          {uploading ? 'Uploading...' : `Upload ${pendingUploads.length} File${pendingUploads.length !== 1 ? 's' : ''}`}
                        </Button>
                      </div>
                    )}

                    {/* Existing Outputs */}
                    {outputs.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Uploaded Outputs ({outputs.length})</Label>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                          {outputs.map((output: any) => {
                            const url = output.file_url || output.artifact?.file_url;
                            const previewUrl = output.artifact?.preview_url || url;
                            return (
                              <div key={output.id} className="relative group">
                                <img
                                  src={previewUrl}
                                  alt={output.label || 'Output'}
                                  className="w-full aspect-square object-cover rounded border border-border"
                                />
                                <Button
                                  variant="destructive"
                                  size="icon"
                                  className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => deleteOutput.mutate(output.id)}
                                  disabled={deleteOutput.isPending}
                                >
                                  {deleteOutput.isPending ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3 w-3" />
                                  )}
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Switch back to review */}
                <div className="text-center">
                  <Button variant="outline" onClick={() => setNeedsChangesMode('review')}>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Back to Review Feedback
                  </Button>
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Job Info</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <Badge className={getStatusColor(job.status)}>{getStatusLabel(job.status)}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Outputs</span>
                      <span>{outputs.length}</span>
                    </div>
                    {job.due_date && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Due</span>
                        <span>{format(new Date(job.due_date), 'MMM d, yyyy')}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </main>
      ) : (
        <main className="container mx-auto px-6 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Brief / Instructions */}
              <Accordion type="single" collapsible defaultValue="instructions">
                <AccordionItem value="instructions" className="border rounded-lg px-4">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      <span className="font-medium">Brief / Instructions</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pt-2 pb-4 space-y-4">
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {displayInstructions}
                      </p>
                      
                      {/* Input Images Grid */}
                      {inputs.length > 0 && (
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Reference Images</Label>
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                            {inputs.map((input: any) => (
                              <div key={input.id} className="relative group">
                                <img
                                  src={(input.artifact?.preview_url || input.artifact?.file_url)}
                                  alt={input.label || 'Input'}
                                  className="w-full aspect-square object-cover rounded border border-border"
                                />
                                {input.label && (
                                  <span className="absolute bottom-0 left-0 right-0 bg-black/70 text-[10px] text-white px-1 py-0.5 truncate">
                                    {input.label}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              {/* Inputs Section */}
              {groupedInputs && groupedInputs.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <FileImage className="h-5 w-5" />
                        Input Files
                      </CardTitle>
                      <Button variant="outline" size="sm" onClick={handleDownloadAll}>
                        <Download className="h-4 w-4 mr-2" />
                        Download All
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {groupedInputs.map((group) => (
                        <div key={group.view} className="space-y-3">
                          <h4 className="font-medium text-sm">{group.view} View</h4>
                          <div className="space-y-2">
                            {group.headRender && (
                              <div className="space-y-1">
                                <span className="text-xs text-muted-foreground">Head Render</span>
                                <div className="relative group">
                                  <img
                                    src={group.headRender.artifact?.preview_url || group.headRender.artifact?.file_url}
                                    alt={`${group.view} head render`}
                                    className="w-full aspect-[3/4] object-cover rounded border border-border"
                                  />
                                  <a
                                    href={group.headRender.artifact?.file_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <Download className="h-6 w-6 text-white" />
                                  </a>
                                </div>
                              </div>
                            )}
                            {group.originalSource && (
                              <div className="space-y-1">
                                <span className="text-xs text-muted-foreground">Original Source</span>
                                <div className="relative group">
                                  <img
                                    src={group.originalSource.artifact?.preview_url || group.originalSource.artifact?.file_url}
                                    alt={`${group.view} source`}
                                    className="w-full aspect-[3/4] object-cover rounded border border-border"
                                  />
                                  <a
                                    href={group.originalSource.artifact?.file_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <Download className="h-6 w-6 text-white" />
                                  </a>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Upload Section */}
              {canUpload && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Upload className="h-5 w-5" />
                      Upload Outputs
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Progress */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Upload Progress</span>
                        <span>{outputs.length} output{outputs.length !== 1 ? 's' : ''}</span>
                      </div>
                      <Progress value={uploadProgress} className="h-2" />
                    </div>

                    {/* Drop Zone */}
                    <div
                      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                        isDragOver ? 'border-primary bg-primary/5' : 'border-border'
                      }`}
                      onDragEnter={handleDragEnter}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                    >
                      <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground mb-2">
                        Drag & drop files here, or click to browse
                      </p>
                      <input
                        type="file"
                        multiple
                        accept="*/*"
                        onChange={handleFileInputChange}
                        className="hidden"
                        id="file-upload"
                      />
                      <Button variant="outline" size="sm" asChild>
                        <label htmlFor="file-upload" className="cursor-pointer">
                          Browse Files
                        </label>
                      </Button>
                    </div>

                    {/* Uploaded Files Grid */}
                    {outputs.length > 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        {outputs.map((output: any) => (
                          <div key={output.id} className="relative group">
                            <img
                              src={output.artifact?.preview_url || output.artifact?.file_url || output.file_url}
                              alt={output.label || 'Output'}
                              className="w-full aspect-square object-cover rounded border border-border"
                            />
                            <button
                              onClick={() => deleteOutput.mutate(output.id)}
                              disabled={deleteOutput.isPending}
                              className="absolute top-1 right-1 p-1 bg-red-500/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                            >
                              {deleteOutput.isPending ? (
                                <Loader2 className="h-3 w-3 text-white animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3 text-white" />
                              )}
                            </button>
                            {output.label && (
                              <span className="absolute bottom-0 left-0 right-0 bg-black/70 text-[10px] text-white px-1 py-0.5 truncate">
                                {output.label}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Submitted Outputs - Read Only View */}
              {!canUpload && outputs.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileImage className="h-5 w-5" />
                      Submitted Outputs
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-2">
                      {outputs.map((output: any) => (
                        <div key={output.id} className="relative group">
                          <img
                            src={output.artifact?.preview_url || output.artifact?.file_url || output.file_url}
                            alt={output.label || 'Output'}
                            className="w-full aspect-square object-cover rounded border border-border"
                          />
                          {output.label && (
                            <span className="absolute bottom-0 left-0 right-0 bg-black/70 text-[10px] text-white px-1 py-0.5 truncate">
                              {output.label}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Actions Card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {isPreviewMode && (
                    <>
                      <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-sm">
                        <p className="text-blue-200 font-medium mb-1">Preview Mode</p>
                        <p className="text-blue-300/80 text-xs">
                          This job is open. Click "Start Job" to claim it and begin working.
                        </p>
                      </div>
                      <Button 
                        onClick={() => claimJob.mutate()}
                        disabled={claimJob.isPending}
                        className="w-full"
                      >
                        <Play className="h-4 w-4 mr-2" />
                        {claimJob.isPending ? 'Claiming...' : 'Start Job'}
                      </Button>
                    </>
                  )}
                  
                  {canUpload && (
                    <>
                      <Button 
                        className="w-full" 
                        onClick={() => createSubmission.mutate()}
                        disabled={outputs.length === 0 || createSubmission.isPending}
                      >
                        <Send className="h-4 w-4 mr-2" />
                        {createSubmission.isPending ? 'Submitting...' : 'Submit for Review'}
                      </Button>
                      {outputs.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center">
                          Upload at least 1 output to submit
                        </p>
                      )}
                    </>
                  )}
                  
                  {(job.status === 'IN_PROGRESS' || job.status === 'NEEDS_CHANGES') && !isPreviewMode && (
                    <Button 
                      variant="outline" 
                      className="w-full text-orange-500 border-orange-500/30 hover:bg-orange-500/10"
                      onClick={() => setShowAbandonConfirm(true)}
                    >
                      Return Job
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Notes Card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Notes
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {notes.length > 0 ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {notes.map((note: any) => (
                        <div key={note.id} className="text-sm bg-muted/50 rounded p-2">
                          <p className="text-foreground">{note.body}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(note.created_at), 'MMM d, h:mm a')}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No notes yet.</p>
                  )}
                  
                  <Separator />
                  
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Add a note..."
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      rows={2}
                    />
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleAddNote}
                      disabled={!noteText.trim() || addNote.isPending}
                      className="w-full"
                    >
                      Add Note
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      )}

      {/* Abandon Job Confirmation Dialog */}
      <AlertDialog open={showAbandonConfirm} onOpenChange={setShowAbandonConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Return this job?</AlertDialogTitle>
            <AlertDialogDescription>
              This will release the job back to the pool. Any uploaded outputs will remain, 
              but another freelancer may claim this job.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Working</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => abandonJob.mutate()}
              className="bg-orange-500 hover:bg-orange-600"
            >
              Return Job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
