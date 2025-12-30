import { useState, useEffect, DragEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, CheckCircle, XCircle, Clock, Loader2, Image, Play, AlertTriangle, X, GripVertical } from "lucide-react";
import { formatDistanceToNow, differenceInMinutes } from "date-fns";
import { toast } from "sonner";
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
  logs: any;
  random_count: number | null;
  attempts_per_pose: number | null;
  brand_name?: string;
  talent_name?: string;
  look_name?: string;
  look_product_type?: string | null;
  generation_count?: number;
}

interface GenerationTask {
  talentImageUrl: string;
  talentImageId: string;
  view: string;
  slot: string;
  poseId: string;
  poseUrl: string;
  attempt: number;
  lookId?: string;
}

export function PoseReviewsTab() {
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [resumingJobId, setResumingJobId] = useState<string | null>(null);
  const [groupedJobIds, setGroupedJobIds] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isReviewMode, setIsReviewMode] = useState(false);

  useEffect(() => {
    fetchJobs();
    
    // Subscribe to job updates for real-time progress
    const channel = supabase
      .channel("job-updates")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "generation_jobs" },
        () => {
          fetchJobs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
      logs: job.logs,
      random_count: job.random_count,
      attempts_per_pose: job.attempts_per_pose,
      brand_name: job.brands?.name || "Unknown Brand",
      talent_name: job.talents?.name || "Unknown Talent",
      look_name: job.talent_looks?.name || 'Default Look',
      look_product_type: job.talent_looks?.product_type || null,
      generation_count: countMap[job.id] || 0,
    }));

    setJobs(enrichedJobs);
    setIsLoading(false);
  };

  // Check if a "running" job is actually stale (no update in 5+ minutes)
  const isJobStale = (job: GenerationJob) => {
    if (job.status !== "running") return false;
    const minutesSinceUpdate = differenceInMinutes(new Date(), new Date(job.updated_at));
    return minutesSinceUpdate >= 5;
  };

  // Resume a stale or failed job
  const handleResumeJob = async (job: GenerationJob) => {
    setResumingJobId(job.id);
    
    try {
      // Get already-completed generations for this job
      const { data: existingGenerations } = await supabase
        .from("generations")
        .select("pose_clay_image_id, attempt_index, view, slot, look_id, talent_image_id")
        .eq("generation_job_id", job.id);

      // Build a set of completed task keys
      const completedKeys = new Set(
        (existingGenerations || []).map(g => 
          `${g.pose_clay_image_id}_${g.attempt_index}_${g.view}_${g.slot}`
        )
      );

      // Fetch clay images for the brand
      const { data: clayImagesData } = await supabase
        .from("clay_images")
        .select("*, product_images!inner(slot, products!inner(brand_id, gender, product_type))")
        .eq("product_images.products.brand_id", job.brand_id);

      if (!clayImagesData || clayImagesData.length === 0) {
        toast.error("No clay images found for this brand");
        setResumingJobId(null);
        return;
      }

      // Get talent images for this look
      const { data: talentImages } = await supabase
        .from("talent_images")
        .select("*")
        .eq("look_id", job.look_id);

      if (!talentImages || talentImages.length === 0) {
        toast.error("No talent images found for this look");
        setResumingJobId(null);
        return;
      }

      // Rebuild tasks that weren't completed
      const randomCount = job.random_count || 5;
      const attemptsPerPose = job.attempts_per_pose || 3;
      const model = job.logs?.model || "google/gemini-2.5-flash-image-preview";
      
      // Group talent images by view
      const talentImagesByView: Record<string, any> = {};
      talentImages.forEach(img => {
        talentImagesByView[img.view] = img;
      });

      // Define view-to-slot mapping (smart pairing rules)
      const viewToSlots: Record<string, string[]> = {
        front: ['A', 'B'],
        back: ['C'],
        detail: ['D'],
      };

      // Build remaining tasks
      const remainingTasks: GenerationTask[] = [];

      for (const [view, slots] of Object.entries(viewToSlots)) {
        const talentImage = talentImagesByView[view] || talentImagesByView['front'];
        if (!talentImage) continue;

        for (const slot of slots) {
          // Get clay images for this slot
          const slotClayImages = clayImagesData.filter(
            (c: any) => c.product_images?.slot === slot
          );

          // Randomly select (but use a deterministic shuffle based on job id to be consistent)
          const shuffled = [...slotClayImages].sort(() => Math.random() - 0.5);
          const selectedPoses = shuffled.slice(0, Math.min(randomCount, slotClayImages.length));

          for (const pose of selectedPoses) {
            for (let attempt = 0; attempt < attemptsPerPose; attempt++) {
              const taskKey = `${pose.id}_${attempt}_${view}_${slot}`;
              
              // Skip if already completed
              if (completedKeys.has(taskKey)) continue;

              remainingTasks.push({
                talentImageUrl: talentImage.stored_url,
                talentImageId: talentImage.id,
                view,
                slot,
                poseId: pose.id,
                poseUrl: pose.stored_url,
                attempt,
                lookId: job.look_id || undefined,
              });
            }
          }
        }
      }

      if (remainingTasks.length === 0) {
        // All tasks were already completed
        await supabase
          .from("generation_jobs")
          .update({ status: "completed", updated_at: new Date().toISOString() })
          .eq("id", job.id);
        toast.success("Job was already complete!");
        fetchJobs();
        setResumingJobId(null);
        return;
      }

      toast.success(`Resuming: ${remainingTasks.length} images remaining`);

      // Update job status to running
      await supabase
        .from("generation_jobs")
        .update({ status: "running", updated_at: new Date().toISOString() })
        .eq("id", job.id);

      // Process remaining tasks client-side
      let completed = job.generation_count || 0;
      let rateLimitRetries = 0;
      const maxRateLimitRetries = 5;

      for (let i = 0; i < remainingTasks.length; i++) {
        const task = remainingTasks[i];

        // Check if job was stopped
        const { data: jobCheck } = await supabase
          .from("generation_jobs")
          .select("status")
          .eq("id", job.id)
          .single();

        if (jobCheck?.status === "stopped" || jobCheck?.status === "cancelled") {
          toast.info("Generation stopped");
          break;
        }

        // Call generate-pose-single
        const { data: result, error: taskError } = await supabase.functions.invoke("generate-pose-single", {
          body: { jobId: job.id, task, model },
        });

        if (taskError) {
          console.error(`Task ${i + 1} error:`, taskError);
          continue;
        }

        if (result?.rateLimited) {
          rateLimitRetries++;
          if (rateLimitRetries >= maxRateLimitRetries) {
            toast.error("Too many rate limit errors. Pausing.");
            break;
          }
          toast.warning(`Rate limited. Waiting 30s... (${rateLimitRetries}/${maxRateLimitRetries})`);
          await new Promise(r => setTimeout(r, 30000));
          i--;
          continue;
        }

        if (result?.success) {
          completed++;
          rateLimitRetries = 0;
          
          await supabase
            .from("generation_jobs")
            .update({ progress: completed, updated_at: new Date().toISOString() })
            .eq("id", job.id);
        }

        await new Promise(r => setTimeout(r, 1000));
      }

      // Mark job as completed
      await supabase
        .from("generation_jobs")
        .update({ 
          status: "completed", 
          progress: completed,
          updated_at: new Date().toISOString() 
        })
        .eq("id", job.id);

      toast.success(`Resume completed! ${completed} total images generated.`);
      fetchJobs();
    } catch (err) {
      console.error("Resume error:", err);
      toast.error("Failed to resume job");
    } finally {
      setResumingJobId(null);
    }
  };

  const getStatusIcon = (job: GenerationJob) => {
    if (isJobStale(job)) {
      return <AlertTriangle className="w-5 h-5 text-amber-500" />;
    }
    switch (job.status) {
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

  const getStatusBadge = (job: GenerationJob) => {
    if (isJobStale(job)) {
      return <Badge variant="secondary" className="bg-amber-100 text-amber-800">Stalled ({job.progress}/{job.total})</Badge>;
    }
    switch (job.status) {
      case "completed":
        return <Badge variant="default" className="bg-green-600">Completed</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      case "running":
        return (
          <Badge variant="secondary">
            Running {job.progress !== null && job.total !== null ? `(${job.progress}/${job.total})` : ""}
          </Badge>
        );
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: DragEvent<HTMLDivElement>, jobId: string) => {
    e.dataTransfer.setData("jobId", jobId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const jobId = e.dataTransfer.getData("jobId");
    if (jobId && !groupedJobIds.includes(jobId)) {
      setGroupedJobIds(prev => [...prev, jobId]);
    }
  };

  const removeFromGroup = (jobId: string) => {
    setGroupedJobIds(prev => prev.filter(id => id !== jobId));
  };

  const getGroupedJobInfo = (jobId: string) => {
    return jobs.find(j => j.id === jobId);
  };

  // If reviewing grouped jobs, show the review panel with multiple job IDs
  if (isReviewMode && groupedJobIds.length > 0) {
    return (
      <PoseReviewPanel
        jobIds={groupedJobIds}
        onBack={() => {
          setIsReviewMode(false);
        }}
      />
    );
  }

  // If a single job is selected (from individual "Review & Select" button)
  if (selectedJobIds.length === 1) {
    return (
      <PoseReviewPanel
        jobIds={selectedJobIds}
        onBack={() => setSelectedJobIds([])}
      />
    );
  }

  const completedJobs = jobs.filter(j => j.status === "completed" && (j.generation_count || 0) > 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-6 transition-all ${
          isDragOver 
            ? "border-primary bg-primary/10" 
            : groupedJobIds.length > 0 
              ? "border-primary/50 bg-muted/30" 
              : "border-muted-foreground/30 bg-muted/10"
        }`}
      >
        {groupedJobIds.length === 0 ? (
          <div className="text-center text-muted-foreground">
            <GripVertical className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="font-medium">Drag completed jobs here to group them</p>
            <p className="text-sm mt-1">Create a unified review across multiple looks</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {groupedJobIds.map(jobId => {
                const job = getGroupedJobInfo(jobId);
                return (
                  <Badge 
                    key={jobId} 
                    variant="secondary" 
                    className="px-3 py-1.5 text-sm flex items-center gap-2"
                  >
                    <span>{job?.brand_name} / {job?.talent_name}</span>
                    {job?.look_name && <span className="text-muted-foreground">- {job.look_name}</span>}
                    <button
                      onClick={() => removeFromGroup(jobId)}
                      className="ml-1 hover:text-destructive transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </Badge>
                );
              })}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {groupedJobIds.length} job{groupedJobIds.length > 1 ? "s" : ""} selected • 
                {" "}{groupedJobIds.reduce((sum, id) => sum + (getGroupedJobInfo(id)?.generation_count || 0), 0)} total images
              </p>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setGroupedJobIds([])}
                >
                  Clear All
                </Button>
                <Button 
                  size="sm"
                  onClick={() => setIsReviewMode(true)}
                  className="gap-2"
                >
                  Review {groupedJobIds.length} Job{groupedJobIds.length > 1 ? "s" : ""} Together
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-serif">Past Generation Jobs</h2>
          <p className="text-muted-foreground mt-1">
            Drag completed jobs to group them, or review individually
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
          jobs.map(job => {
            const isStale = isJobStale(job);
            const canResume = isStale || job.status === "failed";
            const isResuming = resumingJobId === job.id;
            const isCompleted = job.status === "completed" && (job.generation_count || 0) > 0;
            const isInGroup = groupedJobIds.includes(job.id);
            
            return (
              <Card 
                key={job.id} 
                className={`p-4 transition-colors ${isStale ? 'border-amber-500/50' : ''} ${isInGroup ? 'border-primary bg-primary/5' : 'hover:bg-muted/30'}`}
                draggable={isCompleted && !isInGroup}
                onDragStart={(e) => handleDragStart(e, job.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {isCompleted && !isInGroup && (
                      <div className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors">
                        <GripVertical className="w-5 h-5" />
                      </div>
                    )}
                    {getStatusIcon(job)}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{job.brand_name}</span>
                        {getStatusBadge(job)}
                        {isInGroup && (
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                            In Group
                          </Badge>
                        )}
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
                  
                  <div className="flex items-center gap-2">
                    {/* Resume button for stale/failed jobs */}
                    {canResume && (
                      <Button 
                        variant="outline"
                        onClick={() => handleResumeJob(job)}
                        disabled={isResuming}
                        className="gap-2"
                      >
                        {isResuming ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Resuming...
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4" />
                            Resume
                          </>
                        )}
                      </Button>
                    )}
                    
                    {/* Review button for completed jobs with images */}
                    {isCompleted && !isInGroup && (
                      <Button 
                        onClick={() => setSelectedJobIds([job.id])}
                        className="gap-2"
                      >
                        Review & Select
                      </Button>
                    )}

                    {/* Remove from group button */}
                    {isInGroup && (
                      <Button 
                        variant="outline"
                        size="sm"
                        onClick={() => removeFromGroup(job.id)}
                        className="gap-2"
                      >
                        <X className="w-4 h-4" />
                        Remove
                      </Button>
                    )}
                    
                    {/* Progress bar for active running jobs */}
                    {job.status === "running" && !isStale && (
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
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
