import { useState, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { HubHeader } from "@/components/layout/HubHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { useJobs, useDeleteJob, useUnassignFreelancer } from "@/hooks/useJobs";
import { useJobsReviewProgress } from "@/hooks/useReviewSystem";
import { useProductionProjects } from "@/hooks/useProductionProjects";
import { JobStatus, JobType } from "@/types/jobs";
import { ArrowLeft, Plus, Search, Briefcase, Eye, CheckCircle, AlertTriangle, FolderOpen, Trash2, Link2, Share2, Copy, Check } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { JobDetailPanel } from "@/components/jobs/JobDetailPanel";
import { CreateJobDialog } from "@/components/jobs/CreateJobDialog";
import { JobReviewPanel } from "@/components/review";
import { ProjectGroupRow, UngroupedJobsRow } from "@/components/job-board/ProjectGroupRow";
import { ShareJobButton } from "@/components/job-board/ShareJobButton";
import { cn } from "@/lib/utils";

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

const typeLabels: Record<JobType, string> = {
  PHOTOSHOP_FACE_APPLY: "Photoshop Apply",
  RETOUCH_FINAL: "Final Retouch",
  FOUNDATION_FACE_REPLACE: "Face Replace",
};

// Statuses that can have a review panel opened
const reviewableStatuses: JobStatus[] = ["IN_PROGRESS", "SUBMITTED", "NEEDS_CHANGES", "APPROVED", "CLOSED"];

export default function JobBoard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [reviewJobId, setReviewJobId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<JobStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<JobType | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [groupByProject, setGroupByProject] = useState(true);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const deleteJob = useDeleteJob();
  const unassignFreelancer = useUnassignFreelancer();

  // Handle group filter from URL
  useEffect(() => {
    const groupParam = searchParams.get('group');
    if (groupParam) {
      setGroupFilter(groupParam);
    }
  }, [searchParams]);

  // Real-time subscription for job updates
  useEffect(() => {
    const channel = supabase
      .channel('unified-jobs-realtime-admin')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'unified_jobs'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['unified-jobs'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Clear group filter handler
  const clearGroupFilter = () => {
    setGroupFilter(null);
    searchParams.delete('group');
    setSearchParams(searchParams);
  };

  const { data: jobs, isLoading: jobsLoading } = useJobs({
    status: statusFilter !== "all" ? statusFilter : undefined,
    type: typeFilter !== "all" ? typeFilter : undefined,
  });

  const { data: projects, isLoading: projectsLoading } = useProductionProjects();
  const { data: reviewProgress } = useJobsReviewProgress();

  const filteredJobs = useMemo(() => {
    return jobs?.filter((job) => {
      // Filter by group if specified
      if (groupFilter && job.job_group_id !== groupFilter) return false;
      
      // Filter by search query
      if (!searchQuery) return true;
      const searchLower = searchQuery.toLowerCase();
      return (
        job.id.toLowerCase().includes(searchLower) ||
        job.title?.toLowerCase().includes(searchLower) ||
        job.assigned_user?.display_name?.toLowerCase().includes(searchLower) ||
        job.assigned_user?.email?.toLowerCase().includes(searchLower)
      );
    }) || [];
  }, [jobs, searchQuery, groupFilter]);

  // Group jobs by project
  const { groupedJobs, ungroupedJobs } = useMemo(() => {
    const grouped = new Map<string, typeof filteredJobs>();
    const ungrouped: typeof filteredJobs = [];

    filteredJobs.forEach(job => {
      if (job.project_id) {
        const existing = grouped.get(job.project_id) || [];
        existing.push(job);
        grouped.set(job.project_id, existing);
      } else {
        ungrouped.push(job);
      }
    });

    return { groupedJobs: grouped, ungroupedJobs: ungrouped };
  }, [filteredJobs]);

  // Count jobs needing review (SUBMITTED status)
  const needsReviewCount = jobs?.filter(j => j.status === "SUBMITTED").length || 0;

  const isLoading = jobsLoading || projectsLoading;

  return (
    <div className="min-h-screen bg-background">
      <HubHeader />

      <main className="px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-semibold">Job Board</h1>
              <p className="text-muted-foreground text-sm">
                Manage external jobs and freelancer assignments
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const shareUrl = `${window.location.origin}/freelancer/join`;
                navigator.clipboard.writeText(shareUrl);
                setShareLinkCopied(true);
                toast.success('Freelancer signup link copied!');
                setTimeout(() => setShareLinkCopied(false), 2000);
              }}
            >
              {shareLinkCopied ? (
                <Check className="h-4 w-4 mr-2 text-green-500" />
              ) : (
                <Share2 className="h-4 w-4 mr-2" />
              )}
              Invite Freelancers
            </Button>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Job
            </Button>
          </div>
        </div>

        {/* Group Filter Banner */}
        {groupFilter && (
          <div className="flex items-center gap-3 mb-4 p-3 bg-primary/10 border border-primary/20 rounded-lg">
            <span className="text-sm">
              Showing jobs from the batch you just created
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={clearGroupFilter}
            >
              Show All Jobs
            </Button>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-4 mb-6 flex-wrap items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search jobs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as JobStatus | "all")}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="OPEN">Open</SelectItem>
              <SelectItem value="ASSIGNED">Assigned</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="SUBMITTED">
                <span className="flex items-center gap-2">
                  Awaiting Review
                  {needsReviewCount > 0 && (
                    <Badge variant="destructive" className="h-4 px-1 text-[10px]">
                      {needsReviewCount}
                    </Badge>
                  )}
                </span>
              </SelectItem>
              <SelectItem value="NEEDS_CHANGES">Needs Changes</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="CLOSED">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v as JobType | "all")}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="PHOTOSHOP_FACE_APPLY">Photoshop Face Apply</SelectItem>
              <SelectItem value="RETOUCH_FINAL">Final Retouch</SelectItem>
              <SelectItem value="FOUNDATION_FACE_REPLACE">Foundation Face Replace</SelectItem>
            </SelectContent>
          </Select>
          
          {/* Group by Project toggle */}
          <div className="flex items-center gap-2 ml-auto">
            <Switch
              id="group-by-project"
              checked={groupByProject}
              onCheckedChange={setGroupByProject}
            />
            <Label htmlFor="group-by-project" className="text-sm cursor-pointer flex items-center gap-1.5">
              <FolderOpen className="h-4 w-4" />
              Group by Project
            </Label>
          </div>
        </div>

        {/* Jobs Display */}
        {groupByProject ? (
          // Grouped view
          <div className="border rounded-lg overflow-hidden">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading jobs...
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8">
                <Briefcase className="h-8 w-8 text-muted-foreground" />
                <p className="text-muted-foreground">No jobs found</p>
              </div>
            ) : (
              <>
                {/* Projects with jobs */}
                {projects?.filter(p => groupedJobs.has(p.id)).map(project => (
                  <ProjectGroupRow
                    key={project.id}
                    project={project}
                    jobs={groupedJobs.get(project.id) || []}
                    onJobClick={setSelectedJobId}
                    onReviewClick={setReviewJobId}
                    reviewableStatuses={reviewableStatuses}
                    reviewProgress={reviewProgress}
                  />
                ))}
                
                {/* Ungrouped jobs */}
                <UngroupedJobsRow
                  jobs={ungroupedJobs}
                  onJobClick={setSelectedJobId}
                  onReviewClick={setReviewJobId}
                  reviewableStatuses={reviewableStatuses}
                  reviewProgress={reviewProgress}
                />
              </>
            )}
          </div>
        ) : (
          // Table view (original)
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Job ID</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-28">Type</TableHead>
                  <TableHead className="w-48">Status</TableHead>
                  <TableHead className="w-32">Assignee</TableHead>
                  <TableHead className="w-20">Due</TableHead>
                  <TableHead className="w-20">Created</TableHead>
                  <TableHead className="w-28"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      Loading jobs...
                    </TableCell>
                  </TableRow>
                ) : filteredJobs?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <div className="flex flex-col items-center gap-2">
                        <Briefcase className="h-8 w-8 text-muted-foreground" />
                        <p className="text-muted-foreground">No jobs found</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredJobs?.map((job) => {
                    const canReview = reviewableStatuses.includes(job.status);
                    const needsReview = job.status === "SUBMITTED";
                    const wasReviewed = job.status === "APPROVED" || job.status === "NEEDS_CHANGES";
                    const isInProgress = job.status === "IN_PROGRESS";
                    const hasOutputs = (job.outputs_count ?? 0) > 0;
                    
                    return (
                      <TableRow
                        key={job.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedJobId(job.id)}
                      >
                        <TableCell className="font-mono text-xs">
                          {job.id.slice(0, 8)}
                        </TableCell>
                        <TableCell className="font-medium truncate max-w-[200px]">
                          {job.title || "Untitled Job"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {typeLabels[job.type]}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
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
                                    <CheckCircle className="h-2.5 w-2.5 mr-0.5" />
                                    {reviewProgress[job.id].approved}
                                  </span>
                                )}
                                {reviewProgress[job.id].changesRequested > 0 && (
                                  <span className="flex items-center text-orange-500">
                                    <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                                    {reviewProgress[job.id].changesRequested}
                                  </span>
                                )}
                                {reviewProgress[job.id].pending > 0 && job.status !== "APPROVED" && (
                                  <span className="text-muted-foreground/60">
                                    +{reviewProgress[job.id].pending}
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs truncate max-w-[120px]">
                          {job.assigned_user ? (
                            job.assigned_user.display_name || job.assigned_user.email?.split('@')[0]
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {job.due_date ? format(new Date(job.due_date), "M/d") : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(job.created_at), "M/d")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <ShareJobButton jobId={job.id} accessToken={job.access_token || null} />
                            {canReview && (
                              <Button
                                variant={needsReview ? "default" : "outline"}
                                size="sm"
                                className="gap-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setReviewJobId(job.id);
                                }}
                              >
                                {wasReviewed ? (
                                  <>
                                    <CheckCircle className="h-3 w-3" />
                                    View
                                  </>
                                ) : isInProgress ? (
                                  <>
                                    <Eye className="h-3 w-3" />
                                    Preview {hasOutputs && `(${job.outputs_count})`}
                                  </>
                                ) : (
                                  <>
                                    <Eye className="h-3 w-3" />
                                    Review
                                  </>
                                )}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setJobToDelete(job.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </main>

      {/* Job Detail Panel */}
      <JobDetailPanel
        jobId={selectedJobId}
        open={!!selectedJobId}
        onClose={() => setSelectedJobId(null)}
      />

      {/* Create Job Dialog */}
      <CreateJobDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      {/* Review Panel */}
      {reviewJobId && (
        <JobReviewPanel
          jobId={reviewJobId}
          onClose={() => setReviewJobId(null)}
        />
      )}

      {/* Delete Job Confirmation Dialog */}
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
    </div>
  );
}
