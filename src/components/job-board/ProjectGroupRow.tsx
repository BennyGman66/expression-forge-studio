import { useState } from "react";
import { ChevronDown, ChevronRight, Pencil, FolderOpen, CheckCircle2, Clock, AlertTriangle, Briefcase, Trash2, UserX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ProductionProject } from "@/types/production-projects";
import { UnifiedJob, JobStatus } from "@/types/jobs";
import { useUpdateProductionProject } from "@/hooks/useProductionProjects";
import { useDeleteJob, useUnassignFreelancer } from "@/hooks/useJobs";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface ProjectGroupRowProps {
  project: ProductionProject;
  jobs: UnifiedJob[];
  onJobClick: (jobId: string) => void;
  onReviewClick: (jobId: string) => void;
  onDeleteJob?: (jobId: string) => void;
  reviewableStatuses: JobStatus[];
  reviewProgress?: Record<string, { approved: number; changesRequested: number; pending: number }>;
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

const statusLabels: Record<JobStatus, string> = {
  OPEN: "OPEN",
  ASSIGNED: "ASSIGNED",
  IN_PROGRESS: "IN PROGRESS",
  SUBMITTED: "AWAITING REVIEW",
  NEEDS_CHANGES: "NEEDS CHANGES",
  APPROVED: "APPROVED",
  CLOSED: "CLOSED",
};

const typeLabels: Record<string, string> = {
  PHOTOSHOP_FACE_APPLY: "Photoshop Apply",
  RETOUCH_FINAL: "Final Retouch",
  FOUNDATION_FACE_REPLACE: "Face Replace",
};

export function ProjectGroupRow({
  project,
  jobs,
  onJobClick,
  onReviewClick,
  onDeleteJob,
  reviewableStatuses,
  reviewProgress,
}: ProjectGroupRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(project.name);
  const [jobToDelete, setJobToDelete] = useState<string | null>(null);
  const updateProject = useUpdateProductionProject();
  const deleteJob = useDeleteJob();
  const unassignFreelancer = useUnassignFreelancer();

  const openCount = jobs.filter(j => j.status === 'OPEN' || j.status === 'ASSIGNED').length;
  const inProgressCount = jobs.filter(j => j.status === 'IN_PROGRESS' || j.status === 'SUBMITTED').length;
  const needsChangesCount = jobs.filter(j => j.status === 'NEEDS_CHANGES').length;
  const approvedCount = jobs.filter(j => j.status === 'APPROVED' || j.status === 'CLOSED').length;

  const handleSaveName = async () => {
    if (editName.trim() && editName !== project.name) {
      await updateProject.mutateAsync({ projectId: project.id, updates: { name: editName.trim() } });
    }
    setIsEditing(false);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border-b">
        <CollapsibleTrigger asChild>
          <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer">
            <Button variant="ghost" size="icon" className="h-6 w-6 p-0">
              {isOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>

            <FolderOpen className="h-4 w-4 text-primary" />

            <div className="flex-1 min-w-0">
              {isEditing ? (
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-7 text-sm"
                    autoFocus
                    onBlur={handleSaveName}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveName();
                      if (e.key === 'Escape') {
                        setEditName(project.name);
                        setIsEditing(false);
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{project.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEditing(true);
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                </div>
              )}
              {project.brand && (
                <span className="text-xs text-muted-foreground ml-2">
                  {project.brand.name}
                </span>
              )}
            </div>

            {/* Stats badges */}
            <div className="flex items-center gap-2">
              {openCount > 0 && (
                <Badge variant="outline" className="gap-1 text-xs bg-blue-500/10 text-blue-400 border-blue-500/30">
                  <Clock className="h-3 w-3" />
                  {openCount}
                </Badge>
              )}
              {inProgressCount > 0 && (
                <Badge variant="outline" className="gap-1 text-xs bg-purple-500/10 text-purple-400 border-purple-500/30">
                  <Briefcase className="h-3 w-3" />
                  {inProgressCount}
                </Badge>
              )}
              {needsChangesCount > 0 && (
                <Badge variant="outline" className="gap-1 text-xs bg-orange-500/10 text-orange-400 border-orange-500/30">
                  <AlertTriangle className="h-3 w-3" />
                  {needsChangesCount}
                </Badge>
              )}
              {approvedCount > 0 && (
                <Badge variant="outline" className="gap-1 text-xs bg-green-500/10 text-green-400 border-green-500/30">
                  <CheckCircle2 className="h-3 w-3" />
                  {approvedCount}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {jobs.length} jobs
              </span>
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="bg-muted/20 border-t">
            {jobs.map((job) => {
              const canReview = reviewableStatuses.includes(job.status);
              const needsReview = job.status === "SUBMITTED";
              const wasReviewed = job.status === "APPROVED" || job.status === "NEEDS_CHANGES";
              const isInProgress = job.status === "IN_PROGRESS";
              const hasOutputs = (job.outputs_count ?? 0) > 0;
              
              return (
                <div
                  key={job.id}
                  className="flex items-center gap-4 px-4 py-2 pl-12 hover:bg-muted/50 cursor-pointer border-b border-muted/30 last:border-b-0"
                  onClick={() => onJobClick(job.id)}
                >
                  <span className="font-mono text-xs text-muted-foreground w-20">
                    {job.id.slice(0, 8)}
                  </span>
                  <span className="flex-1 text-sm truncate">
                    {job.title || "Untitled Job"}
                  </span>
                  <span className="text-xs text-muted-foreground w-24">
                    {typeLabels[job.type] || job.type}
                  </span>
                  <div className="w-32">
                    <div className="flex items-center gap-1">
                      <Badge
                        variant="outline"
                        className={cn(statusColors[job.status], "text-[10px] px-1.5 py-0")}
                      >
                        {statusLabels[job.status]}
                      </Badge>
                      {reviewProgress?.[job.id] && (
                        <span className="flex items-center gap-1 text-[10px]">
                          {reviewProgress[job.id].approved > 0 && (
                            <span className="flex items-center text-green-500">
                              <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                              {reviewProgress[job.id].approved}
                            </span>
                          )}
                          {reviewProgress[job.id].changesRequested > 0 && (
                            <span className="flex items-center text-orange-500">
                              <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                              {reviewProgress[job.id].changesRequested}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 w-28">
                    {job.freelancer_identity ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-500/10 text-purple-400 border-purple-500/30 truncate max-w-[70px]">
                              {job.freelancer_identity.display_name || `${job.freelancer_identity.first_name} ${job.freelancer_identity.last_name?.charAt(0)}.`}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 text-muted-foreground hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                unassignFreelancer.mutate(job.id);
                              }}
                            >
                              <UserX className="h-3 w-3" />
                            </Button>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Claimed by {job.freelancer_identity.first_name} {job.freelancer_identity.last_name}</p>
                          <p className="text-xs text-muted-foreground">Click X to unassign</p>
                        </TooltipContent>
                      </Tooltip>
                    ) : job.assigned_user ? (
                      <span className="text-xs text-muted-foreground truncate">
                        {job.assigned_user.display_name || job.assigned_user.email?.split('@')[0]}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground w-12">
                    {format(new Date(job.created_at), "M/d")}
                  </span>
                  <div className="flex items-center gap-1 w-24">
                    {canReview && (
                      <Button
                        variant={needsReview ? "default" : "outline"}
                        size="sm"
                        className="h-6 text-xs gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          onReviewClick(job.id);
                        }}
                      >
                        {wasReviewed ? "View" : isInProgress ? `Preview${hasOutputs ? ` (${job.outputs_count})` : ''}` : "Review"}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setJobToDelete(job.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!jobToDelete} onOpenChange={(open) => !open && setJobToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Job</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this job and all associated outputs, notes, and submissions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (jobToDelete) {
                  await deleteJob.mutateAsync(jobToDelete);
                  setJobToDelete(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Collapsible>
  );
}

interface UngroupedJobsRowProps {
  jobs: UnifiedJob[];
  onJobClick: (jobId: string) => void;
  onReviewClick: (jobId: string) => void;
  reviewableStatuses: JobStatus[];
  reviewProgress?: Record<string, { approved: number; changesRequested: number; pending: number }>;
}

export function UngroupedJobsRow({
  jobs,
  onJobClick,
  onReviewClick,
  reviewableStatuses,
  reviewProgress,
}: UngroupedJobsRowProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [jobToDelete, setJobToDelete] = useState<string | null>(null);
  const deleteJob = useDeleteJob();
  const unassignFreelancer = useUnassignFreelancer();

  if (jobs.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border-b">
        <CollapsibleTrigger asChild>
          <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer">
            <Button variant="ghost" size="icon" className="h-6 w-6 p-0">
              {isOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>

            <Briefcase className="h-4 w-4 text-muted-foreground" />

            <div className="flex-1 min-w-0">
              <span className="font-medium text-muted-foreground">Ungrouped Jobs</span>
            </div>

            <span className="text-xs text-muted-foreground">
              {jobs.length} jobs
            </span>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="bg-muted/20 border-t">
            {jobs.map((job) => {
              const canReview = reviewableStatuses.includes(job.status);
              const needsReview = job.status === "SUBMITTED";
              const wasReviewed = job.status === "APPROVED" || job.status === "NEEDS_CHANGES";
              const isInProgress = job.status === "IN_PROGRESS";
              const hasOutputs = (job.outputs_count ?? 0) > 0;
              
              return (
                <div
                  key={job.id}
                  className="flex items-center gap-4 px-4 py-2 pl-12 hover:bg-muted/50 cursor-pointer border-b border-muted/30 last:border-b-0"
                  onClick={() => onJobClick(job.id)}
                >
                  <span className="font-mono text-xs text-muted-foreground w-20">
                    {job.id.slice(0, 8)}
                  </span>
                  <span className="flex-1 text-sm truncate">
                    {job.title || "Untitled Job"}
                  </span>
                  <span className="text-xs text-muted-foreground w-24">
                    {typeLabels[job.type] || job.type}
                  </span>
                  <div className="w-32">
                    <Badge
                      variant="outline"
                      className={cn(statusColors[job.status], "text-[10px] px-1.5 py-0")}
                    >
                      {statusLabels[job.status]}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 w-28">
                    {job.freelancer_identity ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-500/10 text-purple-400 border-purple-500/30 truncate max-w-[70px]">
                              {job.freelancer_identity.display_name || `${job.freelancer_identity.first_name} ${job.freelancer_identity.last_name?.charAt(0)}.`}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 text-muted-foreground hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                unassignFreelancer.mutate(job.id);
                              }}
                            >
                              <UserX className="h-3 w-3" />
                            </Button>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Claimed by {job.freelancer_identity.first_name} {job.freelancer_identity.last_name}</p>
                          <p className="text-xs text-muted-foreground">Click X to unassign</p>
                        </TooltipContent>
                      </Tooltip>
                    ) : job.assigned_user ? (
                      <span className="text-xs text-muted-foreground truncate">
                        {job.assigned_user.display_name || job.assigned_user.email?.split('@')[0]}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground w-12">
                    {format(new Date(job.created_at), "M/d")}
                  </span>
                  <div className="flex items-center gap-1 w-24">
                    {canReview && (
                      <Button
                        variant={needsReview ? "default" : "outline"}
                        size="sm"
                        className="h-6 text-xs gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          onReviewClick(job.id);
                        }}
                      >
                        {wasReviewed ? "View" : isInProgress ? `Preview${hasOutputs ? ` (${job.outputs_count})` : ''}` : "Review"}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setJobToDelete(job.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!jobToDelete} onOpenChange={(open) => !open && setJobToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Job</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this job and all associated outputs, notes, and submissions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (jobToDelete) {
                  await deleteJob.mutateAsync(jobToDelete);
                  setJobToDelete(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Collapsible>
  );
}
