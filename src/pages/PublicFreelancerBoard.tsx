import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFreelancerIdentity } from '@/hooks/useFreelancerIdentity';
import { usePublicFreelancerJobs } from '@/hooks/usePublicJob';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Briefcase, Clock, Play, CheckCircle, AlertTriangle, User, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { FreelancerNamePrompt } from '@/components/freelancer/FreelancerNamePrompt';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export default function PublicFreelancerBoard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const { identity, setIdentity, hasIdentity, isLoading: identityLoading } = useFreelancerIdentity();
  const { data: jobs = [], isLoading: jobsLoading } = usePublicFreelancerJobs(identity?.id);
  const [identitySaving, setIdentitySaving] = useState(false);
  const [claimingJobId, setClaimingJobId] = useState<string | null>(null);

  // Split jobs into open (claimable) and my jobs (assigned to me)
  const openJobs = jobs.filter(job => 
    job.status === 'OPEN' && !job.freelancer_identity_id
  );
  
  const myJobs = jobs.filter(job => 
    job.freelancer_identity_id === identity?.id
  );

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

  const claimJob = useMutation({
    mutationFn: async (jobId: string) => {
      // Atomic claim: only update if job is still OPEN and unassigned
      const { data, error } = await supabase
        .from('unified_jobs')
        .update({ 
          status: 'IN_PROGRESS',
          freelancer_identity_id: identity?.id,
          started_at: new Date().toISOString()
        })
        .eq('id', jobId)
        .eq('status', 'OPEN')
        .is('freelancer_identity_id', null)
        .select()
        .single();
      
      if (error) throw error;
      if (!data) throw new Error('Job is no longer available - it may have been claimed by someone else');
      return data;
    },
    onSuccess: (_, jobId) => {
      queryClient.invalidateQueries({ queryKey: ['public-freelancer-jobs'] });
      toast.success('Job claimed! Redirecting...');
      navigate(`/work/${jobId}`);
    },
    onError: (error: any) => {
      // Refetch to update the UI
      queryClient.invalidateQueries({ queryKey: ['public-freelancer-jobs'] });
      toast.error(error.message || 'Failed to claim job');
      setClaimingJobId(null);
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

  const handleClaimJob = (jobId: string) => {
    setClaimingJobId(jobId);
    claimJob.mutate(jobId);
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

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'SUBMITTED': return 'In Review';
      case 'NEEDS_CHANGES': return 'Needs Changes';
      case 'IN_PROGRESS': return 'In Progress';
      default: return status;
    }
  };

  const getPriorityBadge = (priority?: number) => {
    if (priority === 1) return <Badge className="bg-red-500/20 text-red-400 text-xs">URGENT</Badge>;
    return null;
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
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Job Board</h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                <User className="h-4 w-4" />
                <span>Working as <strong className="text-foreground">{identity?.displayName}</strong></span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 space-y-8">
        {/* My Jobs Section */}
        {myJobs.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              My Jobs ({myJobs.length})
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {myJobs.map((job) => (
                <Card key={job.id} className="hover:border-primary/50 transition-colors cursor-pointer" onClick={() => navigate(`/work/${job.id}`)}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base font-medium">
                        {job.title || job.type?.replace(/_/g, ' ')}
                      </CardTitle>
                      {getPriorityBadge(job.priority)}
                    </div>
                    <Badge className={`${getStatusColor(job.status)} w-fit text-xs`}>
                      {getStatusLabel(job.status)}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                      {job.instructions || 'No instructions provided'}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {job.due_date && `Due ${format(new Date(job.due_date), 'MMM d')}`}
                      </span>
                      <Button variant="ghost" size="sm" className="gap-1">
                        Continue <ArrowRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Open Jobs Section */}
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-400" />
            Open Jobs ({openJobs.length})
          </h2>
          
          {jobsLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading jobs...</div>
          ) : openJobs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">All caught up!</h3>
                <p className="text-muted-foreground">
                  No open jobs available right now. Check back later.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {openJobs.map((job) => (
                <Card key={job.id} className="hover:border-primary/50 transition-colors">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base font-medium">
                        {job.title || job.type?.replace(/_/g, ' ')}
                      </CardTitle>
                      {getPriorityBadge(job.priority)}
                    </div>
                    <Badge variant="outline" className="w-fit text-xs">
                      {job.type?.replace(/_/g, ' ')}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                      {job.instructions || 'No instructions provided'}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {job.due_date && `Due ${format(new Date(job.due_date), 'MMM d')}`}
                      </span>
                      <Button 
                        size="sm" 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClaimJob(job.id);
                        }}
                        disabled={claimingJobId === job.id}
                        className="gap-1"
                      >
                        {claimingJobId === job.id ? (
                          'Claiming...'
                        ) : (
                          <>
                            <Play className="h-3 w-3" />
                            Start Working
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
