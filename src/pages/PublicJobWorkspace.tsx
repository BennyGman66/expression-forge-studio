import { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useFreelancerIdentity } from '@/hooks/useFreelancerIdentity';
import { usePublicJobById, usePublicJobInputs, usePublicJobOutputs, usePublicJobNotes, usePublicLatestSubmission } from '@/hooks/usePublicJob';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { toast } from 'sonner';
import { Download, Upload, Send, Clock, CheckCircle, Play, FileImage, AlertTriangle, X, FileText, User, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { FreelancerNamePrompt } from '@/components/freelancer/FreelancerNamePrompt';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface PendingUpload {
  id: string;
  file: File;
  view: 'front' | 'side' | 'back' | null;
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
      await supabase
        .from('unified_jobs')
        .update({ status: 'SUBMITTED' })
        .eq('id', job?.id);

      return submission;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-job-by-id', jobId] });
      queryClient.invalidateQueries({ queryKey: ['public-latest-submission', jobId] });
      toast.success('Job submitted for review!');
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
    const imageFiles = files.filter(file => {
      const name = file.name.toLowerCase();
      return file.type.startsWith('image/') || 
        name.endsWith('.psd') || 
        name.endsWith('.tiff') ||
        name.endsWith('.tif') ||
        name.endsWith('.ai') ||
        name.endsWith('.pdf') ||
        name.endsWith('.png') ||
        name.endsWith('.jpg') ||
        name.endsWith('.jpeg');
    });
    
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
    e.target.value = '';
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
        const fileName = `public/${job?.id}/${Date.now()}-${pending.view}-${pending.file.name}`;
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
          label: `${pending.view?.charAt(0).toUpperCase()}${pending.view?.slice(1)} View - ${pending.file.name}`,
          freelancer_identity_id: identity?.id,
        });

        if (pending.preview) {
          URL.revokeObjectURL(pending.preview);
        }
      }
      
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

  const isFullyReadOnly = job.status === 'APPROVED' || job.status === 'CLOSED';
  const isReadOnly = job.status === 'SUBMITTED' || isFullyReadOnly;
  // Allow uploads for IN_PROGRESS, NEEDS_CHANGES, and SUBMITTED (to update before review completes)
  const canUpload = job.status === 'IN_PROGRESS' || job.status === 'NEEDS_CHANGES' || job.status === 'SUBMITTED';
  const canStart = job.status === 'OPEN' || job.status === 'ASSIGNED';

  return (
    <div className="min-h-screen bg-background">
      {/* Status Banners */}
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
                    {job.instructions ? (
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {job.instructions}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">
                        No specific instructions provided.
                      </p>
                    )}
                    
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
                      accept="image/*,.psd,.tiff,.ai,.pdf"
                      onChange={handleFileInputChange}
                      className="hidden"
                      id="file-upload"
                    />
                    <label htmlFor="file-upload">
                      <Button variant="outline" size="sm" asChild>
                        <span>Browse Files</span>
                      </Button>
                    </label>
                  </div>

                  {/* Pending Uploads */}
                  {pendingUploads.length > 0 && (
                    <div className="space-y-3">
                      <Label>Assign Views to Files</Label>
                      {pendingUploads.map((pending) => (
                        <div key={pending.id} className="flex items-center gap-3 p-2 border rounded">
                          {pending.preview ? (
                            <img src={pending.preview} alt="" className="h-12 w-12 object-cover rounded" />
                          ) : (
                            <div className="h-12 w-12 bg-muted rounded flex items-center justify-center">
                              <FileImage className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">{pending.file.name}</p>
                          </div>
                          <Select
                            value={pending.view || ''}
                            onValueChange={(v) => updatePendingView(pending.id, v as 'front' | 'side' | 'back')}
                          >
                            <SelectTrigger className="w-28">
                              <SelectValue placeholder="View" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="front" disabled={uploadedViews.has('front') || (pendingViews.has('front') && pending.view !== 'front')}>
                                Front
                              </SelectItem>
                              <SelectItem value="side" disabled={uploadedViews.has('side') || (pendingViews.has('side') && pending.view !== 'side')}>
                                Side
                              </SelectItem>
                              <SelectItem value="back" disabled={uploadedViews.has('back') || (pendingViews.has('back') && pending.view !== 'back')}>
                                Back
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <Button variant="ghost" size="icon" onClick={() => removePendingFile(pending.id)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button 
                        onClick={handleUploadPending} 
                        disabled={pendingWithViews.length === 0 || uploading}
                        className="w-full"
                      >
                        {uploading ? 'Uploading...' : `Upload ${pendingWithViews.length} File(s)`}
                      </Button>
                    </div>
                  )}

                  {/* Uploaded Outputs */}
                  {outputs.length > 0 && (
                    <div className="space-y-2">
                      <Label>Uploaded Outputs</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {outputs.map((output: any) => (
                          <div key={output.id} className="relative group">
                            <img
                              src={output.file_url || output.artifact?.file_url}
                              alt={output.label || 'Output'}
                              className="w-full aspect-[3/4] object-cover rounded border border-border"
                            />
                            <span className="absolute bottom-0 left-0 right-0 bg-black/70 text-[10px] text-white px-1 py-0.5 truncate">
                              {output.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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
                {canStart && (
                  <Button className="w-full" onClick={handleStartJob}>
                    <Play className="h-4 w-4 mr-2" />
                    Start Job
                  </Button>
                )}
                
                {canUpload && (
                  <Button 
                    className="w-full" 
                    onClick={handleSubmitJob}
                    disabled={outputs.length < 1 || createSubmission.isPending}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {createSubmission.isPending ? 'Submitting...' : 'Submit for Review'}
                  </Button>
                )}

                {isReadOnly && (
                  <p className="text-sm text-muted-foreground text-center">
                    This job is {job.status === 'SUBMITTED' ? 'awaiting review' : job.status.toLowerCase()}.
                  </p>
                )}

                {/* Pre-submission checklist */}
                {canUpload && job.type === 'FOUNDATION_FACE_REPLACE' && (
                  <div className="pt-2 border-t space-y-2">
                    <p className="text-xs text-muted-foreground">Pre-submission checklist:</p>
                    {['front', 'side', 'back'].map(view => (
                      <div key={view} className="flex items-center gap-2 text-sm">
                        {uploadedViews.has(view) ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <div className="h-4 w-4 rounded-full border-2 border-muted" />
                        )}
                        <span className={uploadedViews.has(view) ? 'text-foreground' : 'text-muted-foreground'}>
                          {view.charAt(0).toUpperCase() + view.slice(1)} view uploaded
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Notes Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {notes.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {notes.map((note: any) => (
                      <div key={note.id} className="p-2 bg-muted rounded text-sm">
                        <p>{note.body}</p>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(note.created_at), 'MMM d, h:mm a')}
                        </span>
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
    </div>
  );
}
