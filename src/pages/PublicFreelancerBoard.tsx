import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFreelancerIdentity } from '@/hooks/useFreelancerIdentity';
import { usePublicFreelancerJobs } from '@/hooks/usePublicJob';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Briefcase, Clock, CheckCircle, AlertCircle, AlertTriangle, User, ArrowRight, Eye, Users } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';
import { FreelancerNamePrompt } from '@/components/freelancer/FreelancerNamePrompt';
import { useQueryClient } from '@tanstack/react-query';
import { JOB_TYPE_CONFIG } from '@/lib/jobTypes';
import type { UnifiedJob } from '@/types/jobs';

export default function PublicFreelancerBoard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const { identity, setIdentity, hasIdentity, isLoading: identityLoading } = useFreelancerIdentity();
  const { data: jobs = [], isLoading: jobsLoading } = usePublicFreelancerJobs(identity?.id);
  const [identitySaving, setIdentitySaving] = useState(false);

  // Split jobs into open (claimable) and my jobs (assigned to me)
  const openJobs = jobs.filter(job => 
    job.status === 'OPEN' && !job.freelancer_identity_id
  );
  
  const myJobs = jobs.filter(job => 
    job.freelancer_identity_id === identity?.id
  );

  // Filter my jobs by status
  const inProgressJobs = myJobs.filter(j => j.status === 'IN_PROGRESS');
  const needsChangesJobs = myJobs.filter(j => j.status === 'NEEDS_CHANGES');
  const submittedJobs = myJobs.filter(j => j.status === 'SUBMITTED');
  const completedJobs = myJobs.filter(j => j.status === 'APPROVED' || j.status === 'CLOSED');

  // Jobs being worked on by OTHER freelancers
  const othersJobs = jobs.filter(job => 
    job.freelancer_identity_id && 
    job.freelancer_identity_id !== identity?.id &&
    ['IN_PROGRESS', 'SUBMITTED', 'NEEDS_CHANGES'].includes(job.status)
  );

  // Helper to get initials from freelancer name
  const getInitials = (freelancer: UnifiedJob['freelancer']) => {
    if (!freelancer) return '??';
    const displayName = freelancer.display_name || `${freelancer.first_name} ${freelancer.last_name}`;
    const parts = displayName.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length-1][0]}`.toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  };

  const getFreelancerName = (freelancer: UnifiedJob['freelancer']) => {
    if (!freelancer) return 'Unknown';
    return freelancer.display_name || `${freelancer.first_name} ${freelancer.last_name}`;
  };

  // Real-time subscription for job updates
  useEffect(() => {
    const channel = supabase
      .channel('unified-jobs-realtime-public')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'unified_jobs'
        },
        () => {
          // Refetch jobs when any job changes
          queryClient.invalidateQueries({ queryKey: ['public-freelancer-jobs'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const handleIdentitySubmit = async (firstName: string, lastName: string) => {
    setIdentitySaving(true);
    try {
      await setIdentity(firstName, lastName);
    } finally {
      setIdentitySaving(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN': return 'bg-blue-500/20 text-blue-400';
      case 'IN_PROGRESS': return 'bg-yellow-500/20 text-yellow-400';
      case 'SUBMITTED': return 'bg-purple-500/20 text-purple-400';
      case 'APPROVED': return 'bg-green-500/20 text-green-400';
      case 'NEEDS_CHANGES': return 'bg-orange-500/20 text-orange-400';
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
    return job.type?.replace(/_/g, ' ') || 'Job';
  };

  const getJobInstructions = (job: UnifiedJob) => {
    if (job.instructions) return job.instructions;
    // Fallback to default instructions from job type config
    const config = JOB_TYPE_CONFIG[job.type as keyof typeof JOB_TYPE_CONFIG];
    return config?.defaultInstructions || 'No instructions provided';
  };

  const renderJobRow = (job: UnifiedJob, variant: 'default' | 'orange' = 'default') => {
    const bgClass = variant === 'orange' 
      ? 'bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20'
      : 'bg-muted/50 hover:bg-muted';

    return (
      <div
        key={job.id}
        className={`p-3 rounded-lg cursor-pointer transition-colors h-[56px] flex items-center ${bgClass}`}
        onClick={() => navigate(`/work/${job.id}`)}
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
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/work/${job.id}`);
              }}
            >
              <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // Loading state
  if (identityLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Freelancer Portal</h1>
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="h-4 w-4" />
              <span>Welcome back, <strong className="text-foreground">{identity?.displayName}</strong></span>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
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

        {/* Active Jobs Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Needs Changes - Priority Section (only show if there are items) */}
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
                  <p className="text-xs text-center text-muted-foreground">
                    +{needsChangesJobs.length - 5} more jobs needing changes
                  </p>
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
              {jobsLoading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : openJobs.length === 0 ? (
                <div className="text-center py-4">
                  <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <p className="text-muted-foreground text-sm">No open jobs available</p>
                </div>
              ) : (
                openJobs.slice(0, 5).map(job => (
                  <div
                    key={job.id}
                    className="p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors h-[56px] flex items-center cursor-pointer"
                    onClick={() => navigate(`/work/${job.id}`)}
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
                          navigate(`/work/${job.id}`);
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
                <p className="text-xs text-center text-muted-foreground">
                  +{openJobs.length - 5} more open jobs
                </p>
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
              {jobsLoading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : inProgressJobs.length === 0 ? (
                <p className="text-muted-foreground text-sm">No jobs in progress</p>
              ) : (
                inProgressJobs.slice(0, 5).map(job => renderJobRow(job))
              )}
              {inProgressJobs.length > 5 && (
                <p className="text-xs text-center text-muted-foreground">
                  +{inProgressJobs.length - 5} more in-progress jobs
                </p>
              )}
            </CardContent>
          </Card>

          {/* Being Worked On by Others */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                Being Worked On
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  (by others)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {jobsLoading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : othersJobs.length === 0 ? (
                <p className="text-muted-foreground text-sm">No jobs being worked on by others</p>
              ) : (
                <TooltipProvider>
                  {othersJobs.slice(0, 8).map(job => (
                    <div
                      key={job.id}
                      className="p-3 rounded-lg bg-muted/30 h-[56px] flex items-center"
                    >
                      <div className="flex items-center justify-between w-full gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-muted-foreground flex items-center">
                            <span className="truncate">{getJobTitle(job)}</span>
                          </p>
                          <Badge className={`${getStatusColor(job.status)} text-xs`}>
                            {job.status.replace('_', ' ')}
                          </Badge>
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium text-primary flex-shrink-0 cursor-default">
                              {getInitials(job.freelancer)}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{getFreelancerName(job.freelancer)}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  ))}
                </TooltipProvider>
              )}
              {othersJobs.length > 8 && (
                <p className="text-xs text-center text-muted-foreground">
                  +{othersJobs.length - 8} more jobs by others
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
