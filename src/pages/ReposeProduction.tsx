import { useSearchParams, useParams } from "react-router-dom";
import { HubHeader } from "@/components/layout/HubHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JobSelectPanel } from "@/components/repose-production/JobSelectPanel";
import { BatchSetupPanel } from "@/components/repose-production/BatchSetupPanel";
import { GeneratePanel } from "@/components/repose-production/GeneratePanel";
import { ReviewPanel } from "@/components/repose-production/ReviewPanel";
import { ExportPanel } from "@/components/repose-production/ExportPanel";
import { useReposeBatch, useReposeOutputs } from "@/hooks/useReposeBatches";
import { Briefcase, Settings, Sparkles, ClipboardList, Download } from "lucide-react";

const VALID_TABS = ["select", "setup", "generate", "review", "export"];

export default function ReposeProduction() {
  const { batchId } = useParams<{ batchId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  
  // If we have a batchId, default to setup tab, otherwise select
  const defaultTab = batchId ? "setup" : "select";
  const activeTab = VALID_TABS.includes(tabFromUrl || "") ? tabFromUrl! : defaultTab;

  const { data: batch } = useReposeBatch(batchId);
  const { data: outputs } = useReposeOutputs(batchId);

  const handleTabChange = (tab: string) => {
    setSearchParams({ tab });
  };

  // Determine if tabs should be disabled based on batch state
  const hasBatch = !!batch || !!batchId;
  const canGenerate = hasBatch && batch?.brand_id;
  // Enable Review/Export if there are any completed outputs
  const hasCompletedOutputs = (outputs?.filter(o => o.status === 'complete').length || 0) > 0;

  return (
    <div className="min-h-screen bg-background">
      <HubHeader currentApp="Repose Production" />

      <main className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-serif">Repose Production</h1>
            <p className="text-muted-foreground mt-1">
              Apply brand clay pose libraries to approved job outputs at scale
            </p>
          </div>

          <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
            <TabsList className="bg-secondary/50 p-1">
              <TabsTrigger value="select" className="gap-2">
                <Briefcase className="w-4 h-4" />
                Job Select
              </TabsTrigger>
              <TabsTrigger value="setup" className="gap-2" disabled={!hasBatch}>
                <Settings className="w-4 h-4" />
                Batch Setup
              </TabsTrigger>
              <TabsTrigger value="generate" className="gap-2" disabled={!canGenerate}>
                <Sparkles className="w-4 h-4" />
                Generate
              </TabsTrigger>
              <TabsTrigger value="review" className="gap-2" disabled={!hasCompletedOutputs}>
                <ClipboardList className="w-4 h-4" />
                Review
              </TabsTrigger>
              <TabsTrigger value="export" className="gap-2" disabled={!hasCompletedOutputs}>
                <Download className="w-4 h-4" />
                Export
              </TabsTrigger>
            </TabsList>

            <TabsContent value="select">
              <JobSelectPanel 
                onBatchCreated={(newBatchId) => {
                  // Navigate to the batch URL would happen in the panel
                }}
              />
            </TabsContent>

            <TabsContent value="setup">
              <BatchSetupPanel batchId={batchId} />
            </TabsContent>

            <TabsContent value="generate">
              <GeneratePanel batchId={batchId} />
            </TabsContent>

            <TabsContent value="review">
              <ReviewPanel batchId={batchId} />
            </TabsContent>

            <TabsContent value="export">
              <ExportPanel batchId={batchId} />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
