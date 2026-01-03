import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HubHeader } from "@/components/layout/HubHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { useJobs } from "@/hooks/useJobs";
import { JobStatus, JobType } from "@/types/jobs";
import { ArrowLeft, Plus, Search, Clock, User, Briefcase } from "lucide-react";
import { format } from "date-fns";
import { JobDetailPanel } from "@/components/jobs/JobDetailPanel";
import { CreateJobDialog } from "@/components/jobs/CreateJobDialog";

const statusColors: Record<JobStatus, string> = {
  OPEN: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  ASSIGNED: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  IN_PROGRESS: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  SUBMITTED: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  NEEDS_CHANGES: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  APPROVED: "bg-green-500/20 text-green-400 border-green-500/30",
  CLOSED: "bg-muted text-muted-foreground border-muted",
};

const typeLabels: Record<JobType, string> = {
  PHOTOSHOP_FACE_APPLY: "Photoshop Face Apply",
  RETOUCH_FINAL: "Final Retouch",
};

export default function JobBoard() {
  const navigate = useNavigate();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<JobStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<JobType | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: jobs, isLoading } = useJobs({
    status: statusFilter !== "all" ? statusFilter : undefined,
    type: typeFilter !== "all" ? typeFilter : undefined,
  });

  const filteredJobs = jobs?.filter((job) => {
    if (!searchQuery) return true;
    const searchLower = searchQuery.toLowerCase();
    return (
      job.id.toLowerCase().includes(searchLower) ||
      job.assigned_user?.display_name?.toLowerCase().includes(searchLower) ||
      job.assigned_user?.email?.toLowerCase().includes(searchLower)
    );
  });

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
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Job
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
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
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="OPEN">Open</SelectItem>
              <SelectItem value="ASSIGNED">Assigned</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="SUBMITTED">Submitted</SelectItem>
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
            </SelectContent>
          </Select>
        </div>

        {/* Jobs Table */}
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    Loading jobs...
                  </TableCell>
                </TableRow>
              ) : filteredJobs?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <div className="flex flex-col items-center gap-2">
                      <Briefcase className="h-8 w-8 text-muted-foreground" />
                      <p className="text-muted-foreground">No jobs found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredJobs?.map((job) => (
                  <TableRow
                    key={job.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedJobId(job.id)}
                  >
                    <TableCell className="font-mono text-xs">
                      {job.id.slice(0, 8)}...
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{typeLabels[job.type]}</span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={statusColors[job.status]}
                      >
                        {job.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {job.assigned_user ? (
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            {job.assigned_user.display_name || job.assigned_user.email}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {job.due_date ? (
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            {format(new Date(job.due_date), "MMM d, yyyy")}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(job.created_at), "MMM d, yyyy")}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
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
    </div>
  );
}
