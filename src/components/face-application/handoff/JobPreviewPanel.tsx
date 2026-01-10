import React from 'react';
import { Pencil, Package, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  LookHandoffStatus, 
  REQUIRED_VIEWS, 
  VIEW_LABELS,
  HandoffSummary 
} from '@/types/job-handoff';

interface JobPreviewPanelProps {
  projectName: string;
  jobGroupName: string;
  onJobGroupNameChange: (name: string) => void;
  selectedLook: LookHandoffStatus | null;
  summary: HandoffSummary;
  isEditingName: boolean;
  onStartEditName: () => void;
  onEndEditName: () => void;
}

export function JobPreviewPanel({
  projectName,
  jobGroupName,
  onJobGroupNameChange,
  selectedLook,
  summary,
  isEditingName,
  onStartEditName,
  onEndEditName,
}: JobPreviewPanelProps) {
  return (
    <div className="flex flex-col h-full p-4 overflow-auto">
      {/* Job Group Header */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Job Group</CardTitle>
            <Badge variant="outline">{summary.totalJobs} jobs</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            {isEditingName ? (
              <Input
                value={jobGroupName}
                onChange={(e) => onJobGroupNameChange(e.target.value)}
                onBlur={onEndEditName}
                onKeyDown={(e) => e.key === 'Enter' && onEndEditName()}
                autoFocus
                className="h-8"
              />
            ) : (
              <>
                <span className="font-medium">{jobGroupName || projectName}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={onStartEditName}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {summary.readyLooks} looks ready → {summary.totalJobs} jobs to be created
          </p>
        </CardContent>
      </Card>

      {/* Selected Look Preview */}
      {selectedLook ? (
        <Card className="flex-1">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{selectedLook.name}</CardTitle>
              <Badge 
                variant={selectedLook.status === 'ready' ? 'default' : 'secondary'}
              >
                {selectedLook.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Preview of what will be sent to Photoshop
            </p>
          </CardHeader>
          <CardContent>
            {/* Grid of views - only complete pairs */}
            {(() => {
              const completePairs = REQUIRED_VIEWS.filter(view => {
                const viewData = selectedLook.views[view];
                return viewData.sourceUrl && viewData.hasSelection;
              });

              if (completePairs.length === 0) {
                return (
                  <div className="text-center text-muted-foreground p-6">
                    <p className="text-sm">No complete pairs available</p>
                    <p className="text-xs">Each view needs both an Original and a Head Render</p>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-2 gap-3">
                  {completePairs.map((view) => {
                    const viewData = selectedLook.views[view];
                    return (
                      <ViewPreviewCard
                        key={view}
                        label={VIEW_LABELS[view]}
                        sourceUrl={viewData.sourceUrl}
                        selectedUrl={viewData.selectedUrl}
                        hasSelection={viewData.hasSelection}
                      />
                    );
                  })}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      ) : (
        <Card className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground p-8">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Select a look from the list</p>
            <p className="text-xs">to preview what will be sent to the Job Board</p>
          </div>
        </Card>
      )}
    </div>
  );
}

interface ViewPreviewCardProps {
  label: string;
  sourceUrl: string | null;
  selectedUrl: string | null;
  hasSelection: boolean;
}

function ViewPreviewCard({ label, sourceUrl, selectedUrl, hasSelection }: ViewPreviewCardProps) {
  return (
    <div className="border border-border rounded-md p-2 bg-muted/20">
      <p className="text-xs font-medium mb-2">{label}</p>
      
      <div className="flex items-center gap-2">
        {/* Source Image */}
        <div className="flex-1">
          <p className="text-[10px] text-muted-foreground mb-1">Original</p>
          {sourceUrl ? (
            <div className="aspect-[3/4] bg-muted rounded overflow-hidden">
              <img
                src={sourceUrl}
                alt={`Source ${label}`}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="aspect-[3/4] bg-muted rounded flex items-center justify-center">
              <span className="text-[10px] text-muted-foreground">No image</span>
            </div>
          )}
        </div>

        <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />

        {/* Selected Render */}
        <div className="flex-1">
          <p className="text-[10px] text-muted-foreground mb-1">Head Render</p>
          {hasSelection && selectedUrl ? (
            <div className="aspect-[3/4] bg-muted rounded overflow-hidden ring-2 ring-primary/50">
              <img
                src={selectedUrl}
                alt={`Selected ${label}`}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="aspect-[3/4] bg-muted rounded flex items-center justify-center">
              <span className="text-[10px] text-muted-foreground">Missing</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
