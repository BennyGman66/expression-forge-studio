import { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useJob, useJobInputs, useJobOutputs, useJobNotes, useUpdateJobStatus, useAddJobNote } from '@/hooks/useJobs';
import { useCreateSubmission, useLatestSubmission, useCreateResubmission } from '@/hooks/useReviewSystem';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowLeft, Download, Upload, Send, Clock, CheckCircle, Play, FileImage, ArrowRight, AlertTriangle, DownloadCloud, X, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { SubmissionReviewViewer } from '@/components/freelancer/SubmissionReviewViewer';
import { FreelancerNeedsChangesView } from '@/components/freelancer/FreelancerNeedsChangesView';

// Pending upload with view assignment
interface PendingUpload {
  id: string;
  file: File;
  view: 'front' | 'side' | 'back' | null;
  preview: string;
}

// Group inputs by view for Foundation Face Replace jobs
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

export default function FreelancerJobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const { data: job, isLoading: jobLoading } = useJob(jobId!);
  const { data: inputs = [] } = useJobInputs(jobId!);
  const { data: outputs = [], refetch: refetchOutputs } = useJobOutputs(jobId!);
  const { data: notes = [] } = useJobNotes(jobId!);
  const { data: latestSubmission } = useLatestSubmission(jobId!);
  
  const updateStatus = useUpdateJobStatus();
  const addNote = useAddJobNote();
  const createSubmission = useCreateSubmission();
  const createResubmission = useCreateResubmission();
  
  const [noteText, setNoteText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [pendingReplacements, setPendingReplacements] = useState<Map<string, { file: File; preview: string }>>(new Map());

  // Group inputs by view (Front, Side, Back) for Foundation Face Replace
  const groupedInputs = useMemo(() => {
    if (job?.type !== 'FOUNDATION_FACE_REPLACE') return null;
    
    const groups: Record<string, GroupedInput> = {};
    
    inputs.forEach(input => {
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

  // Expected outputs for Foundation Face Replace
  const expectedOutputs = job?.type === 'FOUNDATION_FACE_REPLACE' ? 3 : 1;
  const uploadProgress = Math.round((outputs.length / expectedOutputs) * 100);

  const handleStartJob = () => {
    updateStatus.mutate(
      { jobId: jobId!, status: 'IN_PROGRESS', assignedUserId: user?.id },
      { onSuccess: () => toast.success('Job started!') }
    );
  };

  const handleSubmitJob = async () => {
    if (outputs.length === 0) {
      toast.error('Please upload at least one output before submitting');
      return;
    }
    if (outputs.length < expectedOutputs) {
      toast.error(`Please upload all ${expectedOutputs} outputs before submitting`);
      return;
    }
    
    // Build assets from job outputs with proper labels
    const assets = outputs.map((output, index) => ({
      fileUrl: output.file_url || output.artifact?.file_url || '',
      label: output.label || `Output ${index + 1}`,
      sortIndex: index,
    }));
    
    // Create submission with assets - this also updates job status to SUBMITTED
    createSubmission.mutate(
      { jobId: jobId!, assets },
      { 
        onSuccess: () => toast.success('Job submitted for review!'),
        onError: (error) => {
          console.error('Submission error:', error);
          toast.error('Failed to submit job');
        }
      }
    );
  };

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    addNote.mutate(
      { jobId: jobId!, body: noteText },
      {
        onSuccess: () => {
          setNoteText('');
          toast.success('Note added');
        },
      }
    );
  };

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    addFilesToPending(files);
  }, []);

  const addFilesToPending = (files: File[]) => {
    const imageFiles = files.filter(file => 
      file.type.startsWith('image/') || 
      file.name.endsWith('.psd') || 
      file.name.endsWith('.tiff') ||
      file.name.endsWith('.ai') ||
      file.name.endsWith('.pdf')
    );
    
    const newUploads: PendingUpload[] = imageFiles.map(file => ({
      id: crypto.randomUUID(),
      file,
      view: null,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : ''
    }));
    
    setPendingUploads(prev => [...prev, ...newUploads]);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    addFilesToPending(Array.from(files));
    e.target.value = ''; // Reset input
  };

  const updatePendingView = (fileId: string, view: 'front' | 'side' | 'back') => {
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
    const filesToUpload = pendingUploads.filter(f => f.view !== null);
    if (filesToUpload.length === 0) {
      toast.error('Please assign a view (Front/Side/Back) to each file');
      return;
    }

    setUploading(true);
    try {
      for (const pending of filesToUpload) {
        const fileName = `${jobId}/${Date.now()}-${pending.view}-${pending.file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('images')
          .upload(fileName, pending.file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('images')
          .getPublicUrl(fileName);

        await supabase.from('job_outputs').insert({
          job_id: jobId,
          file_url: publicUrl,
          label: `${pending.view?.charAt(0).toUpperCase()}${pending.view?.slice(1)} View - ${pending.file.name}`,
          uploaded_by: user?.id,
        });

        // Clean up preview URL
        if (pending.preview) {
          URL.revokeObjectURL(pending.preview);
        }
      }
      
      // Remove uploaded files from pending
      setPendingUploads(prev => prev.filter(f => f.view === null));
      refetchOutputs();
      toast.success(`${filesToUpload.length} output(s) uploaded successfully`);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload outputs');
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadAll = async () => {
    for (const input of inputs) {
      const url = input.artifact?.file_url;
      if (url) {
        window.open(url, '_blank');
      }
    }
  };

  // Check which views are already uploaded
  const uploadedViews = useMemo(() => {
    const views = new Set<string>();
    outputs.forEach(output => {
      const label = output.label?.toLowerCase() || '';
      if (label.includes('front')) views.add('front');
      if (label.includes('side')) views.add('side');
      if (label.includes('back')) views.add('back');
    });
    return views;
  }, [outputs]);

  // Check which views are pending
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
    return job?.title || job?.type.replace(/_/g, ' ') || 'Job';
  };

  const getJobTypeBadge = () => {
    if (job?.type === 'FOUNDATION_FACE_REPLACE') return 'Foundation Face Replace';
    return job?.type?.replace(/_/g, ' ') || '';
  };

  // Get admin feedback for NEEDS_CHANGES status
  const adminFeedback = useMemo(() => {
    if (job?.status !== 'NEEDS_CHANGES') return null;
    // Find the most recent note that isn't from the current user
    return notes.find(note => note.author_id !== user?.id);
  }, [notes, job?.status, user?.id]);

  // Handle resubmission with replacements
  const handleResubmit = async () => {
    if (!latestSubmission || pendingReplacements.size === 0) {
      toast.error('Please replace at least one asset before resubmitting');
      return;
    }
    
    setUploading(true);
    try {
      // Upload replacement files and build URL map
      const replacementUrls = new Map<string, string>();
      
      for (const [assetId, { file }] of pendingReplacements) {
        const fileName = `${jobId}/${Date.now()}-replacement-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('images')
          .upload(fileName, file);
        
        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage
          .from('images')
          .getPublicUrl(fileName);
        
        replacementUrls.set(assetId, publicUrl);
      }
      
      // Create resubmission
      await createResubmission.mutateAsync({
        jobId: jobId!,
        previousSubmissionId: latestSubmission.id,
        replacements: replacementUrls,
      });
      
      // Clean up preview URLs
      for (const { preview } of pendingReplacements.values()) {
        URL.revokeObjectURL(preview);
      }
      setPendingReplacements(new Map());
      
      toast.success('Resubmitted for review!');
    } catch (error) {
      console.error('Resubmission error:', error);
      toast.error('Failed to resubmit');
    } finally {
      setUploading(false);
    }
  };

  const handleReplacementsReady = useCallback((replacements: Map<string, { file: File; preview: string }>) => {
    setPendingReplacements(replacements);
  }, []);

  if (jobLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading job...</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Job not found</p>
          <Button onClick={() => navigate('/freelancer')}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  const isReadOnly = job.status === 'SUBMITTED' || job.status === 'APPROVED' || job.status === 'CLOSED';
  const canUpload = job.status === 'IN_PROGRESS' || job.status === 'NEEDS_CHANGES';

  return (
    <div className="min-h-screen bg-background">
      {/* Needs Changes Banner */}
      {job.status === 'NEEDS_CHANGES' && (
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

      {/* Submitted Banner */}
      {job.status === 'SUBMITTED' && (
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

      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4">
          <Button variant="ghost" onClick={() => navigate('/freelancer/jobs')} className="mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Jobs
          </Button>
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

      <main className="container mx-auto px-6 py-8">
        {/* NEEDS_CHANGES - Dedicated full-width view */}
        {job.status === 'NEEDS_CHANGES' && latestSubmission && (
          <div className="h-[calc(100vh-200px)] min-h-[600px]">
            <FreelancerNeedsChangesView
              submissionId={latestSubmission.id}
              jobId={jobId!}
              versionNumber={latestSubmission.version_number}
              instructions={job.instructions || undefined}
              inputs={inputs}
              onReplacementsChange={handleReplacementsReady}
              onResubmit={handleResubmit}
              isResubmitting={uploading || createResubmission.isPending}
            />
          </div>
        )}

        {/* Standard layout for other statuses */}
        {job.status !== 'NEEDS_CHANGES' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Submission Review Viewer - Show for SUBMITTED when there's a submission */}
            {job.status === 'SUBMITTED' && latestSubmission && (
              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Eye className="h-5 w-5" />
                    Your Submission
                    <Badge variant="outline" className="ml-2">v{latestSubmission.version_number}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <SubmissionReviewViewer
                    submissionId={latestSubmission.id}
                    jobId={jobId!}
                    showReplaceMode={false}
                  />
                </CardContent>
              </Card>
            )}

            {/* Instructions */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg">Instructions</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-foreground whitespace-pre-wrap">
                  {job.instructions || 'No instructions provided.'}
                </p>
              </CardContent>
            </Card>

            {/* Inputs - Grouped by View for Foundation Face Replace */}
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Download className="h-5 w-5" /> Inputs
                </CardTitle>
                {inputs.length > 0 && (
                  <Button variant="outline" size="sm" onClick={handleDownloadAll}>
                    <DownloadCloud className="h-4 w-4 mr-2" />
                    Download All ({inputs.length})
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {inputs.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No input files attached</p>
                ) : groupedInputs && groupedInputs.length > 0 ? (
                  <div className="space-y-6">
                    {groupedInputs.map(group => (
                      <div key={group.view} className="p-4 rounded-lg bg-muted/30 border border-border">
                        <h4 className="font-medium text-foreground mb-4 uppercase tracking-wide text-sm">
                          {group.view} View
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                          {/* Head Render */}
                          <div className="p-3 rounded-lg bg-background border border-border">
                            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase">
                              Head Render
                            </p>
                            {(group.headRender?.artifact?.preview_url || group.headRender?.artifact?.file_url) ? (
                              <img
                                src={group.headRender.artifact.preview_url || group.headRender.artifact.file_url}
                                alt="Head Render"
                                className="w-full h-32 object-contain rounded mb-3 bg-muted"
                              />
                            ) : (
                              <div className="w-full h-32 bg-muted rounded mb-3 flex items-center justify-center">
                                <FileImage className="h-8 w-8 text-muted-foreground" />
                              </div>
                            )}
                            <a
                              href={group.headRender?.artifact?.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              download
                            >
                              <Button variant="outline" size="sm" className="w-full">
                                <Download className="h-4 w-4 mr-2" />
                                Download
                              </Button>
                            </a>
                          </div>

                          {/* Arrow */}
                          <div className="hidden md:flex items-center justify-center absolute left-1/2 -translate-x-1/2">
                            <ArrowRight className="h-6 w-6 text-muted-foreground" />
                          </div>

                          {/* Original Source */}
                          <div className="p-3 rounded-lg bg-background border border-border">
                            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase">
                              Apply to Body
                            </p>
                            {(group.originalSource?.artifact?.preview_url || group.originalSource?.artifact?.file_url) ? (
                              <img
                                src={group.originalSource.artifact.preview_url || group.originalSource.artifact.file_url}
                                alt="Source Body"
                                className="w-full h-32 object-contain rounded mb-3 bg-muted"
                              />
                            ) : (
                              <div className="w-full h-32 bg-muted rounded mb-3 flex items-center justify-center">
                                <FileImage className="h-8 w-8 text-muted-foreground" />
                              </div>
                            )}
                            <a
                              href={group.originalSource?.artifact?.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              download
                            >
                              <Button variant="outline" size="sm" className="w-full">
                                <Download className="h-4 w-4 mr-2" />
                                Download
                              </Button>
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {inputs.map(input => (
                      <div
                        key={input.id}
                        className="p-4 rounded-lg bg-muted/50 border border-border"
                      >
                        <p className="text-sm font-medium text-foreground mb-2">{input.label || 'Input File'}</p>
                        {(input.artifact?.preview_url || input.artifact?.file_url) ? (
                          <img
                            src={input.artifact.preview_url || input.artifact.file_url}
                            alt={input.label || 'Input'}
                            className="w-full h-40 object-cover rounded mb-3"
                          />
                        ) : (
                          <div className="w-full h-40 bg-muted rounded mb-3 flex items-center justify-center">
                            <FileImage className="h-10 w-10 text-muted-foreground" />
                          </div>
                        )}
                        <a
                          href={input.artifact?.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                        >
                          <Button variant="outline" size="sm" className="w-full">
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </Button>
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Outputs */}
            <Card className={`bg-card border-border ${isReadOnly ? 'opacity-75' : ''}`}>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Upload className="h-5 w-5" /> Outputs
                  </CardTitle>
                  {job.type === 'FOUNDATION_FACE_REPLACE' && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {outputs.length} of {expectedOutputs} outputs uploaded
                    </p>
                  )}
                </div>
                {canUpload && (
                  <div>
                    <Input
                      type="file"
                      multiple
                      accept="image/*,.psd,.ai,.pdf,.tiff"
                      onChange={handleFileInputChange}
                      disabled={uploading}
                      className="hidden"
                      id="output-upload"
                    />
                    <Label htmlFor="output-upload">
                      <Button variant="outline" size="sm" asChild disabled={uploading}>
                        <span>Browse Files</span>
                      </Button>
                    </Label>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Upload Progress */}
                {job.type === 'FOUNDATION_FACE_REPLACE' && (
                  <div>
                    <Progress value={uploadProgress} className="h-2" />
                  </div>
                )}

                {/* Already uploaded outputs */}
                {outputs.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                    {outputs.map(output => (
                      <a
                        key={output.id}
                        href={output.file_url || output.artifact?.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-3 rounded-lg bg-green-500/10 border border-green-500/30 hover:bg-green-500/20 transition-colors"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span className="text-xs text-green-400 font-medium">Uploaded</span>
                        </div>
                        <img
                          src={output.file_url || output.artifact?.file_url}
                          alt={output.label || 'Output'}
                          className="w-full h-24 object-cover rounded mb-2"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                        <p className="text-sm text-foreground truncate">{output.label || 'Output File'}</p>
                      </a>
                    ))}
                  </div>
                )}

                {/* Pending uploads with view selector */}
                {pendingUploads.length > 0 && canUpload && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-muted-foreground">Files ready to upload:</p>
                    {pendingUploads.map(pending => (
                      <div 
                        key={pending.id} 
                        className="flex items-center gap-4 p-3 border rounded-lg bg-muted/30"
                      >
                        {/* Preview */}
                        <div className="w-16 h-16 bg-muted rounded flex-shrink-0 overflow-hidden">
                          {pending.preview ? (
                            <img 
                              src={pending.preview} 
                              alt={pending.file.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <FileImage className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                        </div>

                        {/* File Info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{pending.file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(pending.file.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>

                        {/* View Selector Dropdown */}
                        <Select
                          value={pending.view || 'none'}
                          onValueChange={(value) => {
                            if (value !== 'none') {
                              updatePendingView(pending.id, value as 'front' | 'side' | 'back');
                            }
                          }}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue placeholder="Select view" />
                          </SelectTrigger>
                          <SelectContent className="bg-background border shadow-lg z-50">
                            <SelectItem value="none" disabled>Select view</SelectItem>
                            <SelectItem 
                              value="front" 
                              disabled={uploadedViews.has('front') || (pendingViews.has('front') && pending.view !== 'front')}
                            >
                              Front {uploadedViews.has('front') && '(uploaded)'}
                            </SelectItem>
                            <SelectItem 
                              value="side"
                              disabled={uploadedViews.has('side') || (pendingViews.has('side') && pending.view !== 'side')}
                            >
                              Side {uploadedViews.has('side') && '(uploaded)'}
                            </SelectItem>
                            <SelectItem 
                              value="back"
                              disabled={uploadedViews.has('back') || (pendingViews.has('back') && pending.view !== 'back')}
                            >
                              Back {uploadedViews.has('back') && '(uploaded)'}
                            </SelectItem>
                          </SelectContent>
                        </Select>

                        {/* Status indicator */}
                        {pending.view ? (
                          <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
                        )}

                        {/* Remove button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removePendingFile(pending.id)}
                          className="flex-shrink-0 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}

                    {/* Upload pending button */}
                    <Button 
                      onClick={handleUploadPending} 
                      disabled={uploading || pendingWithViews.length === 0}
                      className="w-full"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {uploading ? 'Uploading...' : `Upload ${pendingWithViews.length} File(s)`}
                    </Button>
                  </div>
                )}

                {/* Drag and Drop Zone */}
                {canUpload && (
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`
                      border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
                      ${isDragOver 
                        ? 'border-primary bg-primary/5' 
                        : 'border-muted-foreground/30 bg-muted/30 hover:border-muted-foreground/50'
                      }
                    `}
                    onClick={() => document.getElementById('output-upload')?.click()}
                  >
                    <Upload className={`h-8 w-8 mx-auto mb-3 ${isDragOver ? 'text-primary' : 'text-muted-foreground'}`} />
                    <p className="font-medium">
                      {isDragOver ? 'Drop files here' : 'Drag and drop files here'}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {job.type === 'FOUNDATION_FACE_REPLACE' ? (
                        <>Upload <strong>3 outputs</strong>: Front, Side, and Back views</>
                      ) : (
                        'Upload your completed work files'
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Accepted: PSD, PNG, JPG, TIFF
                    </p>
                  </div>
                )}

                {/* Pre-submission Checklist for Foundation Face Replace */}
                {job.type === 'FOUNDATION_FACE_REPLACE' && canUpload && (outputs.length > 0 || pendingWithViews.length > 0) && (
                  <div className="border rounded-lg p-4 bg-muted/20">
                    <h4 className="font-medium text-sm mb-3">Pre-submission Checklist</h4>
                    <div className="space-y-2">
                      {(['front', 'side', 'back'] as const).map(view => {
                        const isUploaded = uploadedViews.has(view);
                        const isPending = pendingViews.has(view);
                        const hasView = isUploaded || isPending;
                        return (
                          <div key={view} className="flex items-center gap-2 text-sm">
                            {hasView ? (
                              <CheckCircle className={`h-4 w-4 ${isUploaded ? 'text-green-600' : 'text-amber-500'}`} />
                            ) : (
                              <div className="h-4 w-4 border rounded-full" />
                            )}
                            <span className={hasView ? 'text-foreground' : 'text-muted-foreground'}>
                              {view.charAt(0).toUpperCase() + view.slice(1)} view {isUploaded ? '(uploaded)' : isPending ? '(pending)' : ''}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {outputs.length === 0 && pendingUploads.length === 0 && !canUpload && (
                  <p className="text-muted-foreground text-sm">No outputs uploaded</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Actions */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg">Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(job.status === 'OPEN' || job.status === 'ASSIGNED') && (
                  <Button onClick={handleStartJob} className="w-full" disabled={updateStatus.isPending}>
                    <Play className="mr-2 h-4 w-4" /> Start Working
                  </Button>
                )}
                {job.status === 'IN_PROGRESS' && (
                  <>
                    {/* Pre-submit checklist */}
                    <div className="p-3 rounded-lg bg-muted/30 border border-border text-sm space-y-2">
                      <p className="font-medium text-muted-foreground">Before submitting:</p>
                      <div className="flex items-center gap-2">
                        <div className={`h-4 w-4 rounded-full flex items-center justify-center ${outputs.length >= expectedOutputs ? 'bg-green-500' : 'bg-muted'}`}>
                          {outputs.length >= expectedOutputs && <CheckCircle className="h-3 w-3 text-white" />}
                        </div>
                        <span className={outputs.length >= expectedOutputs ? 'text-foreground' : 'text-muted-foreground'}>
                          {expectedOutputs} outputs uploaded
                        </span>
                      </div>
                    </div>
                    <Button 
                      onClick={handleSubmitJob} 
                      className="w-full" 
                      disabled={updateStatus.isPending || createSubmission.isPending || outputs.length < expectedOutputs}
                    >
                      <CheckCircle className="mr-2 h-4 w-4" /> {createSubmission.isPending ? 'Submitting...' : 'Submit for Review'}
                    </Button>
                  </>
                )}
                {job.status === 'SUBMITTED' && (
                  <div className="text-center text-muted-foreground py-4">
                    <Clock className="h-8 w-8 mx-auto mb-2 text-purple-400" />
                    <p>Waiting for review</p>
                  </div>
                )}
                {job.status === 'APPROVED' && (
                  <div className="text-center text-green-400 py-4">
                    <CheckCircle className="h-8 w-8 mx-auto mb-2" />
                    <p>Job Approved!</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Notes */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg">Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="max-h-[300px] overflow-y-auto space-y-3">
                  {notes.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No notes yet</p>
                  ) : (
                    notes.map(note => (
                      <div 
                        key={note.id} 
                        className={`p-3 rounded-lg ${
                          note.author_id !== user?.id 
                            ? 'bg-orange-500/10 border border-orange-500/20' 
                            : 'bg-muted/50'
                        }`}
                      >
                        <p className="text-sm text-foreground">{note.body}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {note.author?.display_name || 'Unknown'} • {format(new Date(note.created_at!), 'MMM d, h:mm a')}
                        </p>
                      </div>
                    ))
                  )}
                </div>
                <Separator />
                <div className="flex gap-2">
                  <Textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Add a note..."
                    className="bg-background border-border resize-none"
                    rows={2}
                  />
                  <Button onClick={handleAddNote} size="icon" disabled={!noteText.trim() || addNote.isPending}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
        )}
      </main>
    </div>
  );
}
