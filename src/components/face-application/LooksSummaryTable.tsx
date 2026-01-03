import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, AlertCircle, Loader2, Briefcase } from "lucide-react";
import { FaceApplicationOutput } from "@/types/face-application";
import { CreateFoundationFaceReplaceJobDialog } from "@/components/jobs/CreateFoundationFaceReplaceJobDialog";
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
  const [selectedLookId, setSelectedLookId] = useState<string | null>(null);
  const [selectedLookName, setSelectedLookName] = useState<string>("");

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

  return (
    <>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Look</TableHead>
              <TableHead className="text-center w-[80px]">Front</TableHead>
              <TableHead className="text-center w-[80px]">Side</TableHead>
              <TableHead className="text-center w-[80px]">Back</TableHead>
              <TableHead className="text-center w-[120px]">Status</TableHead>
              <TableHead className="text-right w-[160px]">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lookSummaries.map(look => (
              <TableRow key={look.id}>
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
                  {look.isGenerating ? (
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
                </TableCell>
              </TableRow>
            ))}
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
      />
    </>
  );
}
