import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useJob, useJobInputs, useJobOutputs, useJobNotes, useUpdateJobStatus, useAddJobNote } from '@/hooks/useJobs';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { ArrowLeft, Download, Upload, Send, Clock, CheckCircle, Play, FileImage } from 'lucide-react';
import { format } from 'date-fns';

export default function FreelancerJobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const { data: job, isLoading: jobLoading } = useJob(jobId!);
  const { data: inputs = [] } = useJobInputs(jobId!);
  const { data: outputs = [], refetch: refetchOutputs } = useJobOutputs(jobId!);
  const { data: notes = [] } = useJobNotes(jobId!);
  
  const updateStatus = useUpdateJobStatus();
  const addNote = useAddJobNote();
  
  const [noteText, setNoteText] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleStartJob = () => {
    updateStatus.mutate(
      { jobId: jobId!, status: 'IN_PROGRESS' },
      { onSuccess: () => toast.success('Job started!') }
    );
  };

  const handleSubmitJob = () => {
    if (outputs.length === 0) {
      toast.error('Please upload at least one output before submitting');
      return;
    }
    updateStatus.mutate(
      { jobId: jobId!, status: 'SUBMITTED' },
      { onSuccess: () => toast.success('Job submitted for review!') }
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

  const handleUploadOutput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fileName = `${jobId}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('images')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('images')
          .getPublicUrl(fileName);

        await supabase.from('job_outputs').insert({
          job_id: jobId,
          file_url: publicUrl,
          label: file.name,
          uploaded_by: user?.id,
        });
      }
      
      refetchOutputs();
      toast.success('Output uploaded successfully');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload output');
    } finally {
      setUploading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN': return 'bg-blue-500/20 text-blue-400';
      case 'ASSIGNED': return 'bg-cyan-500/20 text-cyan-400';
      case 'IN_PROGRESS': return 'bg-yellow-500/20 text-yellow-400';
      case 'SUBMITTED': return 'bg-purple-500/20 text-purple-400';
      case 'APPROVED': return 'bg-green-500/20 text-green-400';
      case 'NEEDS_CHANGES': return 'bg-orange-500/20 text-orange-400';
      case 'CLOSED': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4">
          <Button variant="ghost" onClick={() => navigate('/freelancer/jobs')} className="mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Jobs
          </Button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{job.type.replace(/_/g, ' ')}</h1>
              <p className="text-muted-foreground">
                Created {format(new Date(job.created_at!), 'MMM d, yyyy')}
                {job.due_date && ` • Due ${format(new Date(job.due_date), 'MMM d, yyyy')}`}
              </p>
            </div>
            <Badge className={`${getStatusColor(job.status)} text-sm px-3 py-1`}>{job.status}</Badge>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
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

            {/* Inputs */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Download className="h-5 w-5" /> Inputs
                </CardTitle>
              </CardHeader>
              <CardContent>
                {inputs.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No input files attached</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {inputs.map(input => (
                      <a
                        key={input.id}
                        href={input.artifact?.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                      >
                        {input.artifact?.preview_url ? (
                          <img
                            src={input.artifact.preview_url}
                            alt={input.label || 'Input'}
                            className="w-full h-24 object-cover rounded mb-2"
                          />
                        ) : (
                          <div className="w-full h-24 bg-muted rounded mb-2 flex items-center justify-center">
                            <FileImage className="h-8 w-8 text-muted-foreground" />
                          </div>
                        )}
                        <p className="text-sm text-foreground truncate">{input.label || 'Input File'}</p>
                      </a>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Outputs */}
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Upload className="h-5 w-5" /> Outputs
                </CardTitle>
                {job.status === 'IN_PROGRESS' && (
                  <div>
                    <Input
                      type="file"
                      multiple
                      accept="image/*,.psd,.ai,.pdf"
                      onChange={handleUploadOutput}
                      disabled={uploading}
                      className="hidden"
                      id="output-upload"
                    />
                    <Label htmlFor="output-upload">
                      <Button variant="outline" size="sm" asChild disabled={uploading}>
                        <span>{uploading ? 'Uploading...' : 'Upload Files'}</span>
                      </Button>
                    </Label>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {outputs.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No outputs uploaded yet</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {outputs.map(output => (
                      <a
                        key={output.id}
                        href={output.file_url || output.artifact?.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                      >
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
                {job.status === 'OPEN' && (
                  <Button onClick={handleStartJob} className="w-full" disabled={updateStatus.isPending}>
                    <Play className="mr-2 h-4 w-4" /> Start Working
                  </Button>
                )}
                {job.status === 'IN_PROGRESS' && (
                  <Button onClick={handleSubmitJob} className="w-full" disabled={updateStatus.isPending}>
                    <CheckCircle className="mr-2 h-4 w-4" /> Submit for Review
                  </Button>
                )}
                {job.status === 'SUBMITTED' && (
                  <div className="text-center text-muted-foreground py-4">
                    <Clock className="h-8 w-8 mx-auto mb-2 text-purple-400" />
                    <p>Waiting for review</p>
                  </div>
                )}
                {job.status === 'NEEDS_CHANGES' && (
                  <Button onClick={handleStartJob} variant="outline" className="w-full" disabled={updateStatus.isPending}>
                    <Play className="mr-2 h-4 w-4" /> Resume Working
                  </Button>
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
                      <div key={note.id} className="p-3 rounded-lg bg-muted/50">
                        <p className="text-sm text-foreground">{note.body}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(note.created_at!), 'MMM d, h:mm a')}
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
      </main>
    </div>
  );
}
