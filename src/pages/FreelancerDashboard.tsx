import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useJobs } from '@/hooks/useJobs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Briefcase, Clock, CheckCircle, ArrowRight, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

export default function FreelancerDashboard() {
  const { user, profile, isFreelancer, isInternal } = useAuth();
  const navigate = useNavigate();
  
  // Freelancers see their assigned jobs, internals see all
  const { data: jobs = [], isLoading } = useJobs({
    assignedUserId: isInternal ? undefined : user?.id,
  });

  // Redirect non-freelancers
  useEffect(() => {
    if (!isFreelancer && !isInternal) {
      navigate('/');
    }
  }, [isFreelancer, isInternal, navigate]);

  const openJobs = jobs.filter(j => j.status === 'OPEN' || j.status === 'ASSIGNED');
  const inProgressJobs = jobs.filter(j => j.status === 'IN_PROGRESS');
  const submittedJobs = jobs.filter(j => j.status === 'SUBMITTED');
  const completedJobs = jobs.filter(j => j.status === 'APPROVED' || j.status === 'CLOSED');

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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Open Jobs */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-blue-400" />
                Open Jobs
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : openJobs.length === 0 ? (
                <p className="text-muted-foreground text-sm">No open jobs assigned</p>
              ) : (
                openJobs.slice(0, 5).map(job => (
                  <div
                    key={job.id}
                    className="p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                    onClick={() => navigate(`/freelancer/jobs/${job.id}`)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-foreground">{job.type.replace(/_/g, ' ')}</p>
                        {job.due_date && (
                          <p className="text-xs text-muted-foreground">
                            Due: {format(new Date(job.due_date), 'MMM d, yyyy')}
                          </p>
                        )}
                      </div>
                      <Badge className={getStatusColor(job.status)}>{job.status}</Badge>
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
                inProgressJobs.slice(0, 5).map(job => (
                  <div
                    key={job.id}
                    className="p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                    onClick={() => navigate(`/freelancer/jobs/${job.id}`)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-foreground">{job.type.replace(/_/g, ' ')}</p>
                        {job.due_date && (
                          <p className="text-xs text-muted-foreground">
                            Due: {format(new Date(job.due_date), 'MMM d, yyyy')}
                          </p>
                        )}
                      </div>
                      <Badge className={getStatusColor(job.status)}>{job.status}</Badge>
                    </div>
                  </div>
                ))
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
    </div>
  );
}
