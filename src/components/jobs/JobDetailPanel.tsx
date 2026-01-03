import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useJob,
  useJobInputs,
  useJobOutputs,
  useJobNotes,
  useUpdateJobStatus,
  useAssignJob,
  useAddJobNote,
} from "@/hooks/useJobs";
import { useFreelancers } from "@/hooks/useUsers";
import { useReposeBatchByJobId, useCreateReposeBatch } from "@/hooks/useReposeBatches";
import { JobStatus } from "@/types/jobs";
import {
  Clock,
  User,
  MessageSquare,
  Download,
  Send,
  FileImage,
  Upload,
  Sparkles,
} from "lucide-react";
import { format } from "date-fns";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface JobDetailPanelProps {
  jobId: string | null;
  open: boolean;
  onClose: () => void;
}

const statusColors: Record<JobStatus, string> = {
  OPEN: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  ASSIGNED: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  IN_PROGRESS: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  SUBMITTED: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  NEEDS_CHANGES: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  APPROVED: "bg-green-500/20 text-green-400 border-green-500/30",
  CLOSED: "bg-muted text-muted-foreground border-muted",
};

const typeLabels: Record<string, string> = {
  PHOTOSHOP_FACE_APPLY: "Photoshop Face Apply",
  RETOUCH_FINAL: "Final Retouch",
};

export function JobDetailPanel({ jobId, open, onClose }: JobDetailPanelProps) {
  const navigate = useNavigate();
  const [newNote, setNewNote] = useState("");

  const { data: job, isLoading: jobLoading } = useJob(jobId);
  const { data: inputs } = useJobInputs(jobId);
  const { data: outputs } = useJobOutputs(jobId);
  const { data: notes } = useJobNotes(jobId);
  const { data: freelancers } = useFreelancers();
  const { data: existingBatch } = useReposeBatchByJobId(jobId || undefined);

  const updateStatus = useUpdateJobStatus();
  const assignJob = useAssignJob();
  const addNote = useAddJobNote();
  const createBatch = useCreateReposeBatch();

  const handleCreateReposeBatch = async () => {
    if (!jobId || !job) return;

    // If batch already exists, navigate to it
    if (existingBatch) {
      navigate(`/repose-production/batch/${existingBatch.id}?tab=setup`);
      return;
    }

    // Create new batch with job outputs
    const batchOutputs = outputs?.map(output => ({
      view: output.label || 'unknown',
      source_output_id: output.id,
      source_url: output.file_url || '',
    })).filter(o => o.source_url) || [];

    createBatch.mutate(
      { jobId, outputs: batchOutputs },
      {
        onSuccess: (batch) => {
          navigate(`/repose-production/batch/${batch.id}?tab=setup`);
        },
      }
    );
  };

  const handleStatusChange = (status: JobStatus) => {
    if (jobId) {
      updateStatus.mutate({ jobId, status });
    }
  };

  const handleAssigneeChange = (userId: string) => {
    if (jobId) {
      assignJob.mutate({ jobId, userId: userId === "unassigned" ? null : userId });
    }
  };

  const handleAddNote = () => {
    if (jobId && newNote.trim()) {
      addNote.mutate({ jobId, body: newNote.trim() });
      setNewNote("");
    }
  };

  if (!open) return null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[500px] sm:max-w-[500px] p-0">
        {jobLoading || !job ? (
          <div className="p-6 text-center text-muted-foreground">
            Loading job details...
          </div>
        ) : (
          <ScrollArea className="h-full">
            <SheetHeader className="p-6 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <SheetTitle className="text-lg">
                    {typeLabels[job.type]}
                  </SheetTitle>
                  <p className="text-xs text-muted-foreground font-mono mt-1">
                    {job.id}
                  </p>
                </div>
                <Badge variant="outline" className={statusColors[job.status]}>
                  {job.status.replace("_", " ")}
                </Badge>
              </div>
            </SheetHeader>

            <div className="px-6 space-y-6">
              {/* Status & Assignment */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-2 block">
                    Status
                  </label>
                  <Select
                    value={job.status}
                    onValueChange={(v) => handleStatusChange(v as JobStatus)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OPEN">Open</SelectItem>
                      <SelectItem value="ASSIGNED">Assigned</SelectItem>
                      <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                      <SelectItem value="SUBMITTED">Submitted</SelectItem>
                      <SelectItem value="NEEDS_CHANGES">Needs Changes</SelectItem>
                      <SelectItem value="APPROVED">Approved</SelectItem>
                      <SelectItem value="CLOSED">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-2 block">
                    Assignee
                  </label>
                  <Select
                    value={job.assigned_user_id || "unassigned"}
                    onValueChange={handleAssigneeChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {freelancers?.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.display_name || f.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Meta info */}
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                {job.due_date && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    Due {format(new Date(job.due_date), "MMM d, yyyy")}
                  </div>
                )}
                {job.created_by_user && (
                  <div className="flex items-center gap-1">
                    <User className="h-4 w-4" />
                    Created by {job.created_by_user.display_name || job.created_by_user.email}
                  </div>
                )}
              </div>

              {/* Instructions */}
              {job.instructions && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Instructions</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {job.instructions}
                  </p>
                </div>
              )}

              <Separator />

              {/* Inputs */}
              <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <FileImage className="h-4 w-4" />
                  Inputs ({inputs?.length || 0})
                </h4>
                {inputs && inputs.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {inputs.map((input) => (
                      <div
                        key={input.id}
                        className="aspect-square bg-muted rounded-md overflow-hidden relative group"
                      >
                        {input.artifact?.file_url ? (
                          <>
                            <img
                              src={input.artifact.file_url}
                              alt={input.label || "Input"}
                              className="w-full h-full object-cover"
                            />
                            <a
                              href={input.artifact.file_url}
                              download
                              className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                            >
                              <Download className="h-5 w-5 text-white" />
                            </a>
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                            No file
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No inputs attached</p>
                )}
              </div>

              <Separator />

              {/* Outputs */}
              <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Outputs ({outputs?.length || 0})
                </h4>
                {outputs && outputs.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {outputs.map((output) => (
                      <div
                        key={output.id}
                        className="aspect-square bg-muted rounded-md overflow-hidden relative group"
                      >
                        {output.file_url ? (
                          <>
                            <img
                              src={output.file_url}
                              alt={output.label || "Output"}
                              className="w-full h-full object-cover"
                            />
                            <a
                              href={output.file_url}
                              download
                              className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                            >
                              <Download className="h-5 w-5 text-white" />
                            </a>
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                            No file
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No outputs uploaded yet</p>
                )}

                {/* Create Repose Batch button - only show for APPROVED jobs with outputs */}
                {job.status === 'APPROVED' && outputs && outputs.length > 0 && (
                  <Button
                    onClick={handleCreateReposeBatch}
                    disabled={createBatch.isPending}
                    className="w-full mt-4 gap-2"
                    variant="outline"
                  >
                    <Sparkles className="h-4 w-4" />
                    {existingBatch ? 'Open Repose Batch' : 'Create Repose Batch'}
                  </Button>
                )}
              </div>

              <Separator />

              {/* Notes */}
              <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Notes ({notes?.length || 0})
                </h4>
                <div className="space-y-3 mb-4">
                  {notes?.map((note) => (
                    <div key={note.id} className="flex gap-3">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="text-xs">
                          {(note.author?.display_name || note.author?.email || "?")
                            .slice(0, 2)
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-medium">
                            {note.author?.display_name || note.author?.email}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(note.created_at), "MMM d, h:mm a")}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {note.body}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add note */}
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Add a note..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    className="min-h-[60px]"
                  />
                  <Button
                    size="icon"
                    onClick={handleAddNote}
                    disabled={!newNote.trim() || addNote.isPending}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="h-6" />
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}
