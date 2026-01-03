import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useJobs } from '@/hooks/useJobs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Search } from 'lucide-react';
import { format } from 'date-fns';
import type { JobStatus, JobType } from '@/types/jobs';

export default function FreelancerJobList() {
  const { user, isInternal } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'ALL'>(
    (searchParams.get('status') as JobStatus) || 'ALL'
  );
  const [typeFilter, setTypeFilter] = useState<JobType | 'ALL'>('ALL');

  const { data: jobs = [], isLoading } = useJobs({
    assignedUserId: isInternal ? undefined : user?.id,
  });

  const filteredJobs = jobs.filter(job => {
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

  const getJobTitle = (job: typeof jobs[0]) => {
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
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Job Title</TableHead>
                <TableHead className="text-muted-foreground">Type</TableHead>
                <TableHead className="text-muted-foreground">Priority</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground">Due Date</TableHead>
                <TableHead className="text-muted-foreground">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Loading jobs...
                  </TableCell>
                </TableRow>
              ) : filteredJobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No jobs found
                  </TableCell>
                </TableRow>
              ) : (
                filteredJobs.map(job => (
                  <TableRow
                    key={job.id}
                    className={`border-border cursor-pointer hover:bg-muted/50 ${
                      job.status === 'NEEDS_CHANGES' ? 'bg-orange-500/5' : ''
                    }`}
                    onClick={() => navigate(`/freelancer/jobs/${job.id}`)}
                  >
                    <TableCell className="font-medium text-foreground">
                      {getJobTitle(job)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {job.type.replace(/_/g, ' ')}
                    </TableCell>
                    <TableCell>
                      {getPriorityBadge(job.priority)}
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(job.status)}>
                        {job.status === 'NEEDS_CHANGES' ? 'REVIEW' : job.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {job.due_date ? format(new Date(job.due_date), 'MMM d, yyyy') : '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(job.created_at!), 'MMM d, yyyy')}
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
