import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ClipboardList, Star, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { useReposeBatch, useReposeBatchItems, useReposeOutputs } from "@/hooks/useReposeBatches";
import { LeapfrogLoader } from "@/components/ui/LeapfrogLoader";
import { cn } from "@/lib/utils";

interface ReviewPanelProps {
  batchId: string | undefined;
}

export function ReviewPanel({ batchId }: ReviewPanelProps) {
  const { data: batch, isLoading: batchLoading } = useReposeBatch(batchId);
  const { data: batchItems } = useReposeBatchItems(batchId);
  const { data: outputs } = useReposeOutputs(batchId);

  const [selectedOutputs, setSelectedOutputs] = useState<Set<string>>(new Set());

  // Group outputs by batch_item_id, then by slot
  const groupedOutputs = outputs?.reduce((acc, output) => {
    const itemId = output.batch_item_id;
    if (!acc[itemId]) acc[itemId] = {};
    const slot = output.slot || 'unknown';
    if (!acc[itemId][slot]) acc[itemId][slot] = [];
    acc[itemId][slot].push(output);
    return acc;
  }, {} as Record<string, Record<string, typeof outputs>>) || {};

  const toggleSelection = (outputId: string) => {
    const newSelected = new Set(selectedOutputs);
    if (newSelected.has(outputId)) {
      newSelected.delete(outputId);
    } else {
      newSelected.add(outputId);
    }
    setSelectedOutputs(newSelected);
  };

  const completedCount = outputs?.filter(o => o.status === 'complete').length || 0;
  const failedCount = outputs?.filter(o => o.status === 'failed').length || 0;

  if (batchLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LeapfrogLoader />
      </div>
    );
  }

  if (!batch || (batch.status !== 'RUNNING' && batch.status !== 'COMPLETE')) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No outputs to review yet. Run generation first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold text-green-500">{completedCount}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Failed</p>
                <p className="text-2xl font-bold text-red-500">{failedCount}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Selected</p>
                <p className="text-2xl font-bold">{selectedOutputs.size}</p>
              </div>
            </div>
            {failedCount > 0 && (
              <Button variant="outline" className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Re-run Failed ({failedCount})
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results by Batch Item */}
      <ScrollArea className="h-[600px]">
        <div className="space-y-6">
          {batchItems?.map((item) => {
            const itemOutputs = groupedOutputs[item.id] || {};
            const slots = Object.keys(itemOutputs);

            if (slots.length === 0) return null;

            return (
              <Card key={item.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <ClipboardList className="w-4 h-4" />
                        {item.view.toUpperCase()} View
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Item: {item.id.slice(0, 8)}...
                      </CardDescription>
                    </div>
                    <Badge variant="outline">
                      {Object.values(itemOutputs).flat().filter(o => o?.status === 'complete').length} complete
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Source Image */}
                  <div className="mb-4">
                    <p className="text-xs text-muted-foreground mb-2">Source</p>
                    <div className="w-24 h-24 bg-secondary rounded-lg overflow-hidden">
                      {item.source_url ? (
                        <img 
                          src={item.source_url} 
                          alt="Source" 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          No image
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Outputs by Slot */}
                  {slots.map((slot) => (
                    <div key={slot} className="mb-4">
                      <p className="text-sm font-medium mb-2">Slot {slot}</p>
                      <div className="flex flex-wrap gap-2">
                        {itemOutputs[slot]?.map((output) => (
                          <div
                            key={output.id}
                            onClick={() => output.status === 'complete' && toggleSelection(output.id)}
                            className={cn(
                              "relative w-20 h-20 rounded-lg overflow-hidden cursor-pointer border-2 transition-all",
                              output.status === 'complete' && selectedOutputs.has(output.id)
                                ? "border-primary ring-2 ring-primary/20"
                                : "border-transparent",
                              output.status === 'failed' && "opacity-50 cursor-not-allowed"
                            )}
                          >
                            {output.result_url ? (
                              <img 
                                src={output.result_url} 
                                alt={`Output ${output.attempt_index}`}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full bg-secondary flex items-center justify-center">
                                {output.status === 'queued' && <span className="text-xs">Queued</span>}
                                {output.status === 'running' && <LeapfrogLoader />}
                                {output.status === 'failed' && <span className="text-xs text-red-500">Failed</span>}
                              </div>
                            )}

                            {/* Selection indicator */}
                            {output.status === 'complete' && selectedOutputs.has(output.id) && (
                              <div className="absolute top-1 right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                                <Star className="w-3 h-3 text-primary-foreground fill-current" />
                              </div>
                            )}

                            {/* Status indicator */}
                            {output.status === 'complete' && !selectedOutputs.has(output.id) && (
                              <div className="absolute top-1 right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                                <CheckCircle2 className="w-3 h-3 text-white" />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
