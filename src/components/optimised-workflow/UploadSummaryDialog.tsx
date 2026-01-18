import { Check, X, AlertTriangle, File } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { ParsedUploadFile, UploadSummary } from '@/types/optimised-workflow';

interface UploadSummaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: UploadSummary | null;
  parsedFiles: ParsedUploadFile[];
  onConfirm: () => void;
}

export function UploadSummaryDialog({
  open,
  onOpenChange,
  summary,
  parsedFiles,
  onConfirm,
}: UploadSummaryDialogProps) {
  if (!summary) return null;

  const lookCodes = [...summary.byLookCode.keys()].sort();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload Summary</DialogTitle>
          <DialogDescription>
            Review the files before uploading
          </DialogDescription>
        </DialogHeader>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 py-4">
          <div className="text-center p-3 bg-muted rounded-lg">
            <div className="text-2xl font-semibold">{summary.totalFiles}</div>
            <div className="text-sm text-muted-foreground">Total Files</div>
          </div>
          <div className="text-center p-3 bg-emerald-50 rounded-lg">
            <div className="text-2xl font-semibold text-emerald-600">{summary.newFiles}</div>
            <div className="text-sm text-emerald-600">New</div>
          </div>
          <div className="text-center p-3 bg-amber-50 rounded-lg">
            <div className="text-2xl font-semibold text-amber-600">{summary.duplicatesSkipped}</div>
            <div className="text-sm text-amber-600">Duplicates</div>
          </div>
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <div className="text-2xl font-semibold text-blue-600">{summary.looksCreated}</div>
            <div className="text-sm text-blue-600">New Looks</div>
          </div>
        </div>

        {/* Look breakdown */}
        <ScrollArea className="h-64 border rounded-lg">
          <div className="p-4 space-y-3">
            {lookCodes.map(lookCode => {
              const files = summary.byLookCode.get(lookCode) || [];
              const newCount = files.filter(f => !f.isDuplicate).length;
              const dupCount = files.filter(f => f.isDuplicate).length;

              return (
                <div key={lookCode} className="border-b pb-3 last:border-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{lookCode}</span>
                    <div className="flex gap-2">
                      {newCount > 0 && (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200">
                          <Check className="h-3 w-3 mr-1" />
                          {newCount} new
                        </Badge>
                      )}
                      {dupCount > 0 && (
                        <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          {dupCount} duplicate
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {files.map((file, i) => (
                      <Badge
                        key={i}
                        variant="secondary"
                        className={`text-xs ${file.isDuplicate ? 'opacity-50' : ''}`}
                      >
                        <File className="h-3 w-3 mr-1" />
                        {file.inferredView}
                        {file.isDuplicate && ' (skip)'}
                      </Badge>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={summary.newFiles === 0}>
            Upload {summary.newFiles} Files
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
