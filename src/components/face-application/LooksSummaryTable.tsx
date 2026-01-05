import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Check, AlertCircle, Loader2, Briefcase, ExternalLink, CheckCircle2 } from "lucide-react";
import { FaceApplicationOutput } from "@/types/face-application";
import { CreateFoundationFaceReplaceJobDialog } from "@/components/jobs/CreateFoundationFaceReplaceJobDialog";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface LookSummary {
  id: string;
  name: string;
  views: {
    front: { hasSelection: boolean; isGenerating: boolean; outputCount: number };
    side: { hasSelection: boolean; isGenerating: boolean; outputCount: number };
    back: { hasSelection: boolean; isGenerating: boolean; outputCount: number };
  };
  isReady: boolean;
  isGenerating: boolean;
}

interface LookJobInfo {
  lookId: string;
  jobId: string;
  status: string;
}

interface LooksSummaryTableProps {
  looks: Array<{
    id: string;
    name: string;
    outputs: FaceApplicationOutput[];
  }>;
  projectId: string;
}

function calculateViewStatus(outputs: FaceApplicationOutput[], view: string) {
  const viewOutputs = outputs.filter(o => o.view === view);
  const hasSelection = viewOutputs.some(o => o.is_selected);
  const isGenerating = viewOutputs.some(o => 
    o.status === "pending" || o.status === "generating" || !o.stored_url
  );
  return { hasSelection, isGenerating, outputCount: viewOutputs.length };
}

export function LooksSummaryTable({ looks, projectId }: LooksSummaryTableProps) {
  const navigate = useNavigate();
  const [selectedLookId, setSelectedLookId] = useState<string | null>(null);
  const [selectedLookName, setSelectedLookName] = useState<string>("");
  const [lookJobs, setLookJobs] = useState<LookJobInfo[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);

  // Fetch existing jobs for each look
  const fetchLookJobs = useCallback(async () => {
    if (looks.length === 0) {
      setLoadingJobs(false);
      return;
    }
    
    const lookIds = looks.map(l => l.id);
    
    const { data: jobs } = await supabase
      .from('unified_jobs')
      .select('id, look_id, status')
      .eq('type', 'FOUNDATION_FACE_REPLACE')
      .in('look_id', lookIds);

    if (jobs) {
      setLookJobs(jobs.map(j => ({
        lookId: j.look_id!,
        jobId: j.id,
        status: j.status,
      })));
    }
    setLoadingJobs(false);
  }, [looks]);

  useEffect(() => {
    fetchLookJobs();
  }, [fetchLookJobs]);

  // Build summary data for each look
  const lookSummaries: LookSummary[] = looks.map(look => {
    const frontStatus = calculateViewStatus(look.outputs, "front");
    const sideStatus = calculateViewStatus(look.outputs, "side");
    const backStatus = calculateViewStatus(look.outputs, "back");

    const isReady = frontStatus.hasSelection && sideStatus.hasSelection && backStatus.hasSelection;
    const isGenerating = frontStatus.isGenerating || sideStatus.isGenerating || backStatus.isGenerating;

    return {
      id: look.id,
      name: look.name,
      views: {
        front: frontStatus,
        side: sideStatus,
        back: backStatus,
      },
      isReady,
      isGenerating,
    };
  });

  const handleCreateJob = (lookId: string, lookName: string) => {
    setSelectedLookId(lookId);
    setSelectedLookName(lookName);
  };

  const getJobForLook = (lookId: string) => lookJobs.find(j => j.lookId === lookId);

  const ViewStatusIcon = ({ status }: { status: { hasSelection: boolean; isGenerating: boolean; outputCount: number } }) => {
    if (status.outputCount === 0) {
      return <span className="text-muted-foreground text-xs">—</span>;
    }
    if (status.isGenerating) {
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    }
    if (status.hasSelection) {
      return <Check className="h-4 w-4 text-green-500" />;
    }
    return <AlertCircle className="h-4 w-4 text-yellow-500" />;
  };

  if (lookSummaries.length === 0) {
    return null;
  }

  if (loadingJobs) {
    return (
      <div className="rounded-lg border bg-card p-8 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Product</TableHead>
              <TableHead className="text-center w-[80px]">Front</TableHead>
              <TableHead className="text-center w-[80px]">Side</TableHead>
              <TableHead className="text-center w-[80px]">Back</TableHead>
              <TableHead className="text-center w-[120px]">Status</TableHead>
              <TableHead className="text-right w-[160px]">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lookSummaries.map(look => {
              const existingJob = getJobForLook(look.id);
              const hasJob = !!existingJob;
              
              return (
                <TableRow 
                  key={look.id}
                  className={hasJob ? "bg-muted/30" : ""}
                >
                  <TableCell className="font-medium">{look.name}</TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-center">
                      <ViewStatusIcon status={look.views.front} />
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-center">
                      <ViewStatusIcon status={look.views.side} />
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-center">
                      <ViewStatusIcon status={look.views.back} />
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {hasJob ? (
                      <span className="inline-flex items-center gap-1 text-xs text-primary">
                        <CheckCircle2 className="h-3 w-3" />
                        Job Created
                      </span>
                    ) : look.isGenerating ? (
                      <span className="inline-flex items-center gap-1 text-xs text-blue-600">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Running
                      </span>
                    ) : look.isReady ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600">
                        <Check className="h-3 w-3" />
                        Ready
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Needs selection
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {hasJob ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/jobs?job=${existingJob.jobId}`)}
                      >
                        <ExternalLink className="h-4 w-4 mr-1.5" />
                        View Job
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant={look.isReady ? "default" : "outline"}
                        disabled={!look.isReady || look.isGenerating}
                        onClick={() => handleCreateJob(look.id, look.name)}
                        className={look.isReady ? "bg-green-600 hover:bg-green-700" : ""}
                      >
                        <Briefcase className="h-4 w-4 mr-1.5" />
                        Create Job
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Per-look Job Dialog */}
      <CreateFoundationFaceReplaceJobDialog
        open={!!selectedLookId}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedLookId(null);
            setSelectedLookName("");
          }
        }}
        lookId={selectedLookId || ""}
        lookName={selectedLookName}
        projectId={projectId}
        onJobCreated={fetchLookJobs}
      />
    </>
  );
}
