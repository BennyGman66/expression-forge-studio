import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useFreelancerJobs, useDeleteJob } from '@/hooks/useJobs';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Briefcase, Clock, CheckCircle, ArrowRight, AlertCircle, AlertTriangle, Trash2, Eye } from 'lucide-react';
import { format } from 'date-fns';
import type { UnifiedJob } from '@/types/jobs';
import { useQueryClient } from '@tanstack/react-query';
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

export default function FreelancerDashboard() {
  const { user, profile, isFreelancer, isInternal, isAdmin } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const deleteJob = useDeleteJob();
  const [jobToDelete, setJobToDelete] = useState<string | null>(null);
  
  // Fetch claimable (open/unassigned) jobs + user's assigned jobs
  const { data, isLoading } = useFreelancerJobs(user?.id);
  const { assignedJobs = [], claimableJobs = [] } = data || {};

  // Real-time subscription for job updates
  useEffect(() => {
    const channel = supabase
      .channel('unified-jobs-realtime-dashboard')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'unified_jobs'
        },
        () => {
          // Refetch jobs when any job changes
          queryClient.invalidateQueries({ queryKey: ['freelancer-jobs'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Redirect non-freelancers - using useEffect-like check but let the page render
  if (!isFreelancer && !isInternal && !isLoading) {
    navigate('/');
    return null;
  }

  // Claimable jobs are "Open Jobs" that any freelancer can start
  const openJobs = claimableJobs;
  // Filter assigned jobs by status
  const inProgressJobs = assignedJobs.filter(j => j.status === 'IN_PROGRESS');
  const needsChangesJobs = assignedJobs.filter(j => j.status === 'NEEDS_CHANGES');
  const submittedJobs = assignedJobs.filter(j => j.status === 'SUBMITTED');
  const completedJobs = assignedJobs.filter(j => j.status === 'APPROVED' || j.status === 'CLOSED');

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
    if (priority === 1) return <Badge className="bg-red-500/20 text-red-400 text-xs ml-2">P1</Badge>;
    if (priority === 3) return <Badge className="bg-muted text-muted-foreground text-xs ml-2">P3</Badge>;
    return null;
  };

  const getJobTitle = (job: UnifiedJob) => {
    if (job.title) {
      // Shorten long titles like "XM0XM07279ZGY - jas - Face Replace" to "jas - Face Replace"
      const parts = job.title.split(' - ');
      if (parts.length >= 3) {
        return `${parts[1]} - ${parts[2]}`;
      }
      return job.title;
    }
    return job.type.replace(/_/g, ' ');
  };

  const handleDeleteClick = (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    setJobToDelete(jobId);
  };

  const renderJobRow = (job: UnifiedJob, variant: 'default' | 'orange' = 'default') => {
    const bgClass = variant === 'orange' 
      ? 'bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20'
      : 'bg-muted/50 hover:bg-muted';

    return (
      <div
        key={job.id}
        className={`p-3 rounded-lg cursor-pointer transition-colors h-[56px] flex items-center ${bgClass}`}
        onClick={() => navigate(`/freelancer/jobs/${job.id}`)}
      >
        <div className="flex items-center justify-between w-full gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground flex items-center">
              <span className="truncate">{getJobTitle(job)}</span>
              {getPriorityBadge(job.priority)}
            </p>
            {job.due_date && (
              <p className="text-xs text-muted-foreground">
                Due: {format(new Date(job.due_date), 'MMM d')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Badge className={getStatusColor(job.status)}>
              {variant === 'orange' ? 'REVIEW' : job.status}
            </Badge>
            {isAdmin && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={(e) => handleDeleteClick(e, job.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Freelancer Portal</h1>
            <p className="text-muted-foreground">Welcome back, {profile?.display_name || 'Freelancer'}</p>
          </div>
          <Button variant="outline" onClick={() => navigate('/freelancer/jobs')}>
            View All Jobs <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Open</CardTitle>
              <AlertCircle className="h-4 w-4 text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{openJobs.length}</div>
              <p className="text-xs text-muted-foreground">Awaiting start</p>
            </CardContent>
          </Card>
          
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
              <Clock className="h-4 w-4 text-yellow-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{inProgressJobs.length}</div>
              <p className="text-xs text-muted-foreground">Currently working</p>
            </CardContent>
          </Card>

          <Card className={`bg-card border-border ${needsChangesJobs.length > 0 ? 'ring-1 ring-orange-500/50' : ''}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Needs Changes</CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{needsChangesJobs.length}</div>
              <p className="text-xs text-muted-foreground">Action required</p>
            </CardContent>
          </Card>
          
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Submitted</CardTitle>
              <Briefcase className="h-4 w-4 text-purple-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{submittedJobs.length}</div>
              <p className="text-xs text-muted-foreground">Awaiting review</p>
            </CardContent>
          </Card>
          
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{completedJobs.length}</div>
              <p className="text-xs text-muted-foreground">This month</p>
            </CardContent>
          </Card>
        </div>

        {/* Active Jobs */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Needs Changes - Priority Section */}
          {needsChangesJobs.length > 0 && (
            <Card className="bg-card border-border border-l-4 border-l-orange-500">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-400" />
                  Needs Changes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {needsChangesJobs.slice(0, 5).map(job => renderJobRow(job, 'orange'))}
                {needsChangesJobs.length > 5 && (
                  <Button variant="ghost" className="w-full" onClick={() => navigate('/freelancer/jobs?status=NEEDS_CHANGES')}>
                    View all {needsChangesJobs.length} jobs needing changes
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Open Jobs - Preview First */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-blue-400" />
                Open Jobs
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  (click to preview)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : openJobs.length === 0 ? (
                <p className="text-muted-foreground text-sm">No open jobs available</p>
              ) : (
                openJobs.slice(0, 5).map(job => (
                  <div
                    key={job.id}
                    className="p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors h-[56px] flex items-center cursor-pointer"
                    onClick={() => navigate(`/freelancer/jobs/${job.id}`)}
                  >
                    <div className="flex items-center justify-between w-full gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground flex items-center">
                          <span className="truncate">{getJobTitle(job)}</span>
                          {getPriorityBadge(job.priority)}
                        </p>
                        {job.due_date && (
                          <p className="text-xs text-muted-foreground">
                            Due: {format(new Date(job.due_date), 'MMM d')}
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/freelancer/jobs/${job.id}`);
                        }}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View
                      </Button>
                    </div>
                  </div>
                ))
              )}
              {openJobs.length > 5 && (
                <Button variant="ghost" className="w-full" onClick={() => navigate('/freelancer/jobs?status=OPEN')}>
                  View all {openJobs.length} open jobs
                </Button>
              )}
            </CardContent>
          </Card>

          {/* In Progress Jobs */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-400" />
                In Progress
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : inProgressJobs.length === 0 ? (
                <p className="text-muted-foreground text-sm">No jobs in progress</p>
              ) : (
                inProgressJobs.slice(0, 5).map(job => renderJobRow(job))
              )}
              {inProgressJobs.length > 5 && (
                <Button variant="ghost" className="w-full" onClick={() => navigate('/freelancer/jobs?status=IN_PROGRESS')}>
                  View all {inProgressJobs.length} in-progress jobs
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!jobToDelete} onOpenChange={() => setJobToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Job</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this job? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (jobToDelete) {
                  deleteJob.mutate(jobToDelete);
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
