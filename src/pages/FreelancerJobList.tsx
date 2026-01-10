import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useFreelancerJobs } from '@/hooks/useJobs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Search } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { JobStatus, JobType, UnifiedJob } from '@/types/jobs';

export default function FreelancerJobList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'ALL'>(
    (searchParams.get('status') as JobStatus) || 'ALL'
  );
  const [typeFilter, setTypeFilter] = useState<JobType | 'ALL'>('ALL');

  // Fetch claimable (open/unassigned) jobs + user's assigned jobs
  const { data, isLoading } = useFreelancerJobs(user?.id);
  const { assignedJobs = [], claimableJobs = [] } = data || {};

  // Combine all jobs for the list view
  const allJobs = useMemo(() => {
    return [...claimableJobs, ...assignedJobs];
  }, [claimableJobs, assignedJobs]);

  const filteredJobs = allJobs.filter(job => {
    if (statusFilter !== 'ALL' && job.status !== statusFilter) return false;
    if (typeFilter !== 'ALL' && job.type !== typeFilter) return false;
    if (search) {
      const searchLower = search.toLowerCase();
      const jobTitle = job.title || job.type;
      return (
        jobTitle.toLowerCase().includes(searchLower) ||
        job.type.toLowerCase().includes(searchLower) ||
        job.instructions?.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

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

  const getPriorityBadge = (priority?: number) => {
    if (priority === 1) return <Badge className="bg-red-500/20 text-red-400 text-xs">P1</Badge>;
    if (priority === 3) return <Badge className="bg-muted text-muted-foreground text-xs">P3</Badge>;
    return <Badge className="bg-muted/50 text-muted-foreground text-xs">P2</Badge>;
  };

  const getJobTitle = (job: UnifiedJob) => {
    return job.title || job.type.replace(/_/g, ' ');
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4">
          <Button variant="ghost" onClick={() => navigate('/freelancer')} className="mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
          </Button>
          <h1 className="text-2xl font-bold text-foreground">My Jobs</h1>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search jobs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-card border-border"
            />
          </div>
          
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as JobStatus | 'ALL')}>
            <SelectTrigger className="w-[180px] bg-card border-border">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Status</SelectItem>
              <SelectItem value="OPEN">Open</SelectItem>
              <SelectItem value="ASSIGNED">Assigned</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="NEEDS_CHANGES">Needs Changes</SelectItem>
              <SelectItem value="SUBMITTED">Submitted</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="CLOSED">Closed</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as JobType | 'ALL')}>
            <SelectTrigger className="w-[200px] bg-card border-border">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Types</SelectItem>
              <SelectItem value="PHOTOSHOP_FACE_APPLY">Photoshop Face Apply</SelectItem>
              <SelectItem value="RETOUCH_FINAL">Retouch Final</SelectItem>
              <SelectItem value="FOUNDATION_FACE_REPLACE">Foundation Face Replace</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Jobs Table */}
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-48">Title</TableHead>
                <TableHead className="w-28">Type</TableHead>
                <TableHead className="w-20">Priority</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-20">Due</TableHead>
                <TableHead className="w-20">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    Loading jobs...
                  </TableCell>
                </TableRow>
              ) : filteredJobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <p className="text-muted-foreground">No jobs found</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredJobs.map((job) => (
                  <TableRow
                    key={job.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/freelancer/jobs/${job.id}`)}
                  >
                    <TableCell className="font-medium truncate max-w-[180px]">
                      {getJobTitle(job)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {job.type.replace(/_/g, ' ')}
                    </TableCell>
                    <TableCell>{getPriorityBadge(job.priority)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn(getStatusColor(job.status), "text-[10px] px-1.5 py-0")}>
                        {job.status.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {job.due_date ? format(new Date(job.due_date), "M/d") : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(job.created_at), "M/d")}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </main>
    </div>
  );
}
