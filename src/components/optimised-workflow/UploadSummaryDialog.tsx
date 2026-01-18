import { useState, useEffect } from 'react';
import { Check, AlertTriangle, File, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ParsedUploadFile, UploadSummary, OutputFormat } from '@/types/optimised-workflow';

interface UploadSummaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: UploadSummary | null;
  parsedFiles: ParsedUploadFile[];
  onConfirm: (targetFormat: OutputFormat) => void;
}

export function UploadSummaryDialog({
  open,
  onOpenChange,
  summary,
  parsedFiles,
  onConfirm,
}: UploadSummaryDialogProps) {
  const [targetFormat, setTargetFormat] = useState<OutputFormat>('original');

  // Auto-suggest PNG conversion when TIFFs are detected
  useEffect(() => {
    if (summary && summary.tiffCount > 0 && targetFormat === 'original') {
      setTargetFormat('png');
    }
  }, [summary?.tiffCount]);

  if (!summary) return null;

  const lookCodes = [...summary.byLookCode.keys()].sort();
  const willConvert = targetFormat !== 'original';
  const conversionCount = willConvert ? summary.newFiles : 0;

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
          <div className="text-center p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg">
            <div className="text-2xl font-semibold text-emerald-600">{summary.newFiles}</div>
            <div className="text-sm text-emerald-600">New</div>
          </div>
          <div className="text-center p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
            <div className="text-2xl font-semibold text-amber-600">{summary.duplicatesSkipped}</div>
            <div className="text-sm text-amber-600">Duplicates</div>
          </div>
          <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
            <div className="text-2xl font-semibold text-blue-600">{summary.looksCreated}</div>
            <div className="text-sm text-blue-600">New Looks</div>
          </div>
        </div>

        {/* TIFF Warning */}
        {summary.tiffCount > 0 && (
          <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <span className="text-sm text-amber-700 dark:text-amber-400">
              {summary.tiffCount} TIFF file{summary.tiffCount > 1 ? 's' : ''} detected. 
              TIFFs don't display in browsers—conversion recommended.
            </span>
          </div>
        )}

        {/* Format Selector */}
        <div className="flex items-center gap-4 py-2">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium">Output Format:</Label>
            <Select value={targetFormat} onValueChange={(v) => setTargetFormat(v as OutputFormat)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="original">Keep Original</SelectItem>
                <SelectItem value="png">Convert to PNG</SelectItem>
                <SelectItem value="jpeg">Convert to JPEG</SelectItem>
                <SelectItem value="webp">Convert to WebP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {willConvert && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <RefreshCw className="h-3 w-3" />
              {conversionCount} file{conversionCount !== 1 ? 's' : ''} will be converted
            </Badge>
          )}
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
                        <Badge variant="outline" className="bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 border-emerald-200 dark:border-emerald-800">
                          <Check className="h-3 w-3 mr-1" />
                          {newCount} new
                        </Badge>
                      )}
                      {dupCount > 0 && (
                        <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950/30 text-amber-600 border-amber-200 dark:border-amber-800">
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
                        {file.needsConversion && willConvert && ' →' + targetFormat.toUpperCase()}
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
          <Button onClick={() => onConfirm(targetFormat)} disabled={summary.newFiles === 0}>
            {willConvert ? `Upload & Convert ${summary.newFiles} Files` : `Upload ${summary.newFiles} Files`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
