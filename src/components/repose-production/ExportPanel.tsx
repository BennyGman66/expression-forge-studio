import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Send, AlertCircle, CheckCircle2 } from "lucide-react";
import { useReposeBatch, useReposeOutputs } from "@/hooks/useReposeBatches";
import { LeapfrogLoader } from "@/components/ui/LeapfrogLoader";
import { toast } from "sonner";

interface ExportPanelProps {
  batchId: string | undefined;
}

export function ExportPanel({ batchId }: ExportPanelProps) {
  const { data: batch, isLoading: batchLoading } = useReposeBatch(batchId);
  const { data: outputs } = useReposeOutputs(batchId);

  const [isExporting, setIsExporting] = useState(false);

  const completedOutputs = outputs?.filter(o => o.status === 'complete' && o.result_url) || [];

  const handleDownloadAll = async () => {
    if (completedOutputs.length === 0) {
      toast.error("No completed outputs to download");
      return;
    }

    setIsExporting(true);
    toast.info(`Preparing ${completedOutputs.length} images for download...`);

    // For now, just open each URL in a new tab
    // In production, this would zip them or use a proper download mechanism
    completedOutputs.slice(0, 10).forEach((output, index) => {
      setTimeout(() => {
        if (output.result_url) {
          window.open(output.result_url, '_blank');
        }
      }, index * 500);
    });

    if (completedOutputs.length > 10) {
      toast.info(`Showing first 10 of ${completedOutputs.length} images. Full export coming soon.`);
    }

    setIsExporting(false);
  };

  const handleSendToClientReview = () => {
    toast.info("Send to Client Review functionality coming soon");
  };

  if (batchLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LeapfrogLoader />
      </div>
    );
  }

  if (!batch || batch.status !== 'COMPLETE') {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>Complete generation first to export results.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Export Results
          </CardTitle>
          <CardDescription>
            Download or send completed outputs to the next stage
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-4 bg-secondary/30 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Total Outputs</p>
              <p className="text-2xl font-bold">{outputs?.length || 0}</p>
            </div>
            <div className="text-center p-4 bg-green-500/10 rounded-lg">
              <div className="flex items-center justify-center gap-1 text-green-500 mb-1">
                <CheckCircle2 className="w-3 h-3" />
                <span className="text-xs">Ready to Export</span>
              </div>
              <p className="text-2xl font-bold text-green-500">{completedOutputs.length}</p>
            </div>
            <div className="text-center p-4 bg-secondary/30 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Batch Status</p>
              <Badge variant="secondary">{batch.status}</Badge>
            </div>
            <div className="text-center p-4 bg-secondary/30 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Created</p>
              <p className="text-sm">{new Date(batch.created_at).toLocaleDateString()}</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <Button 
              onClick={handleDownloadAll}
              disabled={completedOutputs.length === 0 || isExporting}
              className="flex-1 gap-2"
              size="lg"
            >
              <Download className="w-4 h-4" />
              Download All ({completedOutputs.length})
            </Button>
            <Button 
              onClick={handleSendToClientReview}
              variant="outline"
              disabled={completedOutputs.length === 0}
              className="flex-1 gap-2"
              size="lg"
            >
              <Send className="w-4 h-4" />
              Send to Client Review
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview Grid */}
      {completedOutputs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>
              First 20 completed outputs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-8 gap-2">
              {completedOutputs.slice(0, 20).map((output) => (
                <div 
                  key={output.id}
                  className="aspect-square rounded-lg overflow-hidden bg-secondary"
                >
                  {output.result_url && (
                    <img 
                      src={output.result_url}
                      alt="Output"
                      className="w-full h-full object-cover hover:scale-105 transition-transform cursor-pointer"
                      onClick={() => window.open(output.result_url!, '_blank')}
                    />
                  )}
                </div>
              ))}
            </div>
            {completedOutputs.length > 20 && (
              <p className="text-sm text-muted-foreground text-center mt-4">
                +{completedOutputs.length - 20} more images
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
