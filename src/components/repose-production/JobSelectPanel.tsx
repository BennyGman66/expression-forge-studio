import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Briefcase, ArrowRight, Images, AlertCircle } from "lucide-react";
import { useEligibleJobsForRepose, useReposeBatchByJobId, useCreateReposeBatch } from "@/hooks/useReposeBatches";
import { LeapfrogLoader } from "@/components/ui/LeapfrogLoader";

interface JobSelectPanelProps {
  onBatchCreated?: (batchId: string) => void;
}

export function JobSelectPanel({ onBatchCreated }: JobSelectPanelProps) {
  const navigate = useNavigate();
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  
  const { data: eligibleJobs, isLoading: jobsLoading } = useEligibleJobsForRepose();
  const { data: existingBatch, isLoading: checkingBatch } = useReposeBatchByJobId(selectedJobId || undefined);
  const createBatch = useCreateReposeBatch();

  const selectedJob = eligibleJobs?.find(j => j.id === selectedJobId);

  const handleProceed = async () => {
    if (!selectedJobId || !selectedJob) return;

    // If batch already exists for this job, navigate to it
    if (existingBatch) {
      navigate(`/repose-production/batch/${existingBatch.id}?tab=setup`);
      return;
    }

    // Create new batch with job outputs
    const outputs = selectedJob.job_outputs?.map(output => ({
      view: output.label || 'unknown',
      source_output_id: output.id,
      source_url: output.file_url || '',
    })).filter(o => o.source_url) || [];

    createBatch.mutate(
      { jobId: selectedJobId, outputs },
      {
        onSuccess: (batch) => {
          navigate(`/repose-production/batch/${batch.id}?tab=setup`);
          onBatchCreated?.(batch.id);
        },
      }
    );
  };

  if (jobsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LeapfrogLoader />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="w-5 h-5" />
            Select Approved Job
          </CardTitle>
          <CardDescription>
            Choose a job with approved outputs to create a repose batch. Each job can only have one batch.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!eligibleJobs || eligibleJobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No approved jobs with outputs available.</p>
              <p className="text-sm mt-2">
                Approve jobs in the Job Board to make them available for reposing.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Approved Job</label>
                <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a job..." />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleJobs.map((job) => (
                      <SelectItem key={job.id} value={job.id}>
                        <div className="flex items-center gap-2">
                          <span>{job.title || `Job ${job.id.slice(0, 8)}`}</span>
                          <Badge variant="outline" className="text-xs">
                            {job.job_outputs?.length || 0} outputs
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedJob && (
                <Card className="bg-secondary/30">
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Job Title</p>
                        <p className="font-medium">{selectedJob.title || "Untitled"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Type</p>
                        <p className="font-medium">{selectedJob.type}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Status</p>
                        <Badge variant="secondary">{selectedJob.status}</Badge>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Approved Outputs</p>
                        <div className="flex items-center gap-1">
                          <Images className="w-4 h-4" />
                          <span className="font-medium">{selectedJob.job_outputs?.length || 0}</span>
                        </div>
                      </div>
                    </div>

                    {existingBatch && (
                      <div className="mt-4 p-3 bg-primary/10 rounded-lg border border-primary/20">
                        <p className="text-sm text-primary">
                          A repose batch already exists for this job. Clicking proceed will open the existing batch.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-end">
                <Button 
                  onClick={handleProceed}
                  disabled={!selectedJobId || createBatch.isPending || checkingBatch}
                  className="gap-2"
                >
                  {existingBatch ? "Open Existing Batch" : "Create Repose Batch"}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
