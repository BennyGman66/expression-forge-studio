import { useState, useCallback } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { isSupportedImage } from "@/lib/tiffImportUtils";

interface BulkUploadZoneProps {
  onFilesSelected: (files: File[]) => void;
  isUploading?: boolean;
  uploadProgress?: { current: number; total: number };
  compact?: boolean;
}

export function BulkUploadZone({
  onFilesSelected,
  isUploading = false,
  uploadProgress,
  compact = false,
}: BulkUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      // Filter to supported image files (including TIFF)
      const files = Array.from(e.dataTransfer.files).filter(isSupportedImage);
      if (files.length > 0) {
        onFilesSelected(files);
      }
    },
    [onFilesSelected]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []).filter(isSupportedImage);
      if (files.length > 0) {
        onFilesSelected(files);
      }
      // Reset input so same file can be selected again
      e.target.value = "";
    },
    [onFilesSelected]
  );

  if (isUploading && uploadProgress) {
    return (
      <div
        className={cn(
          "border-2 border-dashed border-primary/50 rounded-lg bg-primary/5 flex items-center justify-center gap-3",
          compact ? "p-4" : "p-8"
        )}
      >
        <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
        <span className="text-sm text-muted-foreground">
          Uploading {uploadProgress.current} of {uploadProgress.total} images...
        </span>
      </div>
    );
  }

  return (
    <label
      className={cn(
        "border-2 border-dashed rounded-lg cursor-pointer transition-all flex items-center justify-center gap-3",
        isDragOver
          ? "border-primary bg-primary/5 scale-[1.01]"
          : "border-muted-foreground/30 hover:border-primary hover:bg-muted/50",
        compact ? "p-4" : "p-8"
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragOver(false);
      }}
      onDrop={handleDrop}
    >
      <Upload className={cn("text-muted-foreground", compact ? "h-5 w-5" : "h-8 w-8")} />
      <div className={cn("text-center", compact ? "" : "space-y-1")}>
        <p className={cn("font-medium", compact ? "text-sm" : "")}>
          {isDragOver ? "Drop images here" : "Drag images here or click to upload"}
        </p>
        {!compact && (
          <p className="text-xs text-muted-foreground">
            Supports TIFF, PNG, and JPG files
          </p>
        )}
      </div>
      <input
        type="file"
        accept=".tif,.tiff,.png,.jpg,.jpeg,image/*"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />
    </label>
  );
}
