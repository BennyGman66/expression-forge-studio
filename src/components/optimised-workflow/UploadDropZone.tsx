import { useState, useCallback } from 'react';
import { Upload, FolderOpen, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useWorkflowUpload, getFilesFromDataTransfer } from '@/hooks/useWorkflowUpload';
import { UploadSummaryDialog } from './UploadSummaryDialog';
import { ParsedUploadFile, UploadSummary, OutputFormat } from '@/types/optimised-workflow';
import { cn } from '@/lib/utils';

interface UploadDropZoneProps {
  projectId: string;
  compact?: boolean;
}

export function UploadDropZone({ projectId, compact = false }: UploadDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [parsedFiles, setParsedFiles] = useState<ParsedUploadFile[]>([]);
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);

  const { parseFiles, uploadFiles, isProcessing, uploadProgress } = useWorkflowUpload(projectId);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = await getFilesFromDataTransfer(e.dataTransfer);
    if (files.length === 0) return;

    const { parsed, summary } = await parseFiles(files);
    setParsedFiles(parsed);
    setUploadSummary(summary);
    setShowSummary(true);
  }, [parseFiles]);

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const { parsed, summary } = await parseFiles(files);
    setParsedFiles(parsed);
    setUploadSummary(summary);
    setShowSummary(true);

    // Reset input
    e.target.value = '';
  }, [parseFiles]);

  const handleConfirmUpload = (targetFormat: OutputFormat) => {
    setShowSummary(false);
    uploadFiles(parsedFiles, targetFormat);
  };

  if (isProcessing) {
    return (
      <div className={cn(
        'rounded-lg border-2 border-dashed border-primary/30 bg-primary/5',
        compact ? 'p-4' : 'p-8'
      )}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-foreground">
            Uploading images...
          </p>
          <div className="w-full max-w-xs">
            <Progress value={uploadProgress} className="h-2" />
          </div>
          <p className="text-xs text-muted-foreground">
            {uploadProgress}% complete
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          'rounded-lg border-2 border-dashed transition-colors cursor-pointer',
          isDragOver
            ? 'border-primary bg-primary/10'
            : 'border-muted-foreground/30 hover:border-muted-foreground/50',
          compact ? 'p-4' : 'p-8'
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className={cn(
          'flex items-center gap-4',
          compact ? 'flex-row' : 'flex-col text-center'
        )}>
          <div className={cn(
            'rounded-full bg-muted flex items-center justify-center',
            compact ? 'h-10 w-10' : 'h-16 w-16'
          )}>
            <Upload className={cn(
              'text-muted-foreground',
              compact ? 'h-5 w-5' : 'h-8 w-8'
            )} />
          </div>

          <div className={compact ? 'flex-1' : ''}>
            <p className={cn(
              'font-medium text-foreground',
              compact ? 'text-sm' : 'text-lg mb-1'
            )}>
              Drop a folder here
            </p>
            <p className="text-sm text-muted-foreground">
              or click to select files (TIFF, JPEG, PNG)
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size={compact ? 'sm' : 'default'} asChild>
              <label className="cursor-pointer">
                <FolderOpen className="h-4 w-4 mr-2" />
                Select Folder
                <input
                  type="file"
                  // @ts-ignore - webkitdirectory is non-standard but widely supported
                  webkitdirectory=""
                  directory=""
                  multiple
                  className="hidden"
                  onChange={handleFileInput}
                />
              </label>
            </Button>
            <Button variant="outline" size={compact ? 'sm' : 'default'} asChild>
              <label className="cursor-pointer">
                Select Files
                <input
                  type="file"
                  multiple
                  accept=".tif,.tiff,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </label>
            </Button>
          </div>
        </div>
      </div>

      <UploadSummaryDialog
        open={showSummary}
        onOpenChange={setShowSummary}
        summary={uploadSummary}
        parsedFiles={parsedFiles}
        onConfirm={handleConfirmUpload}
      />
    </>
  );
}
