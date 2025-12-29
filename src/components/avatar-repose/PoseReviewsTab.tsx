import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, CheckCircle, XCircle, Clock, Loader2, Image } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { PoseReviewPanel } from "./PoseReviewPanel";

interface GenerationJob {
  id: string;
  brand_id: string;
  talent_id: string;
  look_id: string | null;
  status: string;
  progress: number | null;
  total: number | null;
  created_at: string;
  updated_at: string;
  brand_name?: string;
  talent_name?: string;
  look_name?: string;
  look_product_type?: string | null;
  generation_count?: number;
}

export function PoseReviewsTab() {
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    setIsLoading(true);
    
    // Fetch all generation jobs with brand info
    const { data: jobsData, error } = await supabase
      .from("generation_jobs")
      .select(`
        *,
        brands(name),
        talents(name),
        talent_looks(name, product_type)
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching jobs:", error);
      setIsLoading(false);
      return;
    }

    // Get generation counts for each job
    const jobIds = (jobsData || []).map(j => j.id);
    const { data: genCounts } = await supabase
      .from("generations")
      .select("generation_job_id")
      .in("generation_job_id", jobIds);

    // Count generations per job
    const countMap: Record<string, number> = {};
    (genCounts || []).forEach(g => {
      countMap[g.generation_job_id] = (countMap[g.generation_job_id] || 0) + 1;
    });

    // Map to enriched jobs
    const enrichedJobs: GenerationJob[] = (jobsData || []).map((job: any) => ({
      id: job.id,
      brand_id: job.brand_id,
      talent_id: job.talent_id,
      look_id: job.look_id,
      status: job.status,
      progress: job.progress,
      total: job.total,
      created_at: job.created_at,
      updated_at: job.updated_at,
      brand_name: job.brands?.name || "Unknown Brand",
      talent_name: job.talents?.name || "Unknown Talent",
      look_name: job.talent_looks?.name || 'Default Look',
      look_product_type: job.talent_looks?.product_type || null,
      generation_count: countMap[job.id] || 0,
    }));

    setJobs(enrichedJobs);
    setIsLoading(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "failed":
        return <XCircle className="w-5 h-5 text-destructive" />;
      case "running":
        return <Loader2 className="w-5 h-5 text-primary animate-spin" />;
      default:
        return <Clock className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string, progress?: number | null, total?: number | null) => {
    switch (status) {
      case "completed":
        return <Badge variant="default" className="bg-green-600">Completed</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      case "running":
        return (
          <Badge variant="secondary">
            Running {progress !== null && total !== null ? `(${progress}/${total})` : ""}
          </Badge>
        );
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  // If a job is selected, show the review panel
  if (selectedJobId) {
    return (
      <PoseReviewPanel
        jobId={selectedJobId}
        onBack={() => setSelectedJobId(null)}
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-serif">Past Generation Jobs</h2>
          <p className="text-muted-foreground mt-1">
            Review and select poses from completed generation jobs
          </p>
        </div>
        <Button variant="outline" onClick={fetchJobs} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* Jobs List */}
      <div className="space-y-3">
        {isLoading ? (
          // Loading skeletons
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <Skeleton className="h-9 w-28" />
              </div>
            </Card>
          ))
        ) : jobs.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <Image className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No generation jobs found.</p>
            <p className="text-sm mt-1">Start generating poses in the Pose Generator tab.</p>
          </Card>
        ) : (
          jobs.map(job => (
            <Card key={job.id} className="p-4 hover:bg-muted/30 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {getStatusIcon(job.status)}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{job.brand_name}</span>
                      {getStatusBadge(job.status, job.progress, job.total)}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {job.talent_name}
                      {job.look_name && ` - ${job.look_name}`}
                      {job.look_product_type && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          {job.look_product_type}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{job.generation_count} images generated</span>
                      <span>•</span>
                      <span>{formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}</span>
                    </div>
                  </div>
                </div>
                
                {job.status === "completed" && job.generation_count > 0 && (
                  <Button 
                    onClick={() => setSelectedJobId(job.id)}
                    className="gap-2"
                  >
                    Review & Select
                  </Button>
                )}
                
                {job.status === "running" && (
                  <div className="text-right">
                    <div className="text-sm font-medium">
                      {job.progress}/{job.total}
                    </div>
                    <div className="w-24 h-2 bg-muted rounded-full overflow-hidden mt-1">
                      <div 
                        className="h-full bg-primary transition-all"
                        style={{ width: `${((job.progress || 0) / (job.total || 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
