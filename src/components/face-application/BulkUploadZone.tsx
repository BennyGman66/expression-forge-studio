import { useState, useCallback, useRef } from "react";
import { Upload, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { isSupportedImage, getFilesFromDataTransfer } from "@/lib/tiffImportUtils";
import { Button } from "@/components/ui/button";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      // Use the new helper that handles folders
      const files = await getFilesFromDataTransfer(e.dataTransfer);
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

  const handleFolderInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []).filter(isSupportedImage);
      if (files.length > 0) {
        onFilesSelected(files);
      }
      // Reset input so same folder can be selected again
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
    <div
      className={cn(
        "border-2 border-dashed rounded-lg transition-all",
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
      <div className={cn(
        "flex items-center gap-3",
        compact ? "justify-center" : "flex-col justify-center"
      )}>
        {!compact && (
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Upload className="h-8 w-8" />
            <FolderOpen className="h-8 w-8" />
          </div>
        )}
        
        <div className={cn("text-center", compact ? "" : "space-y-1")}>
          <p className={cn("font-medium", compact ? "text-sm" : "")}>
            {isDragOver ? "Drop files or folder here" : "Drag files or folder here"}
          </p>
          {!compact && (
            <p className="text-xs text-muted-foreground">
              Supports TIFF, PNG, and JPG files • Drop a folder for bulk import
            </p>
          )}
        </div>

        <div className={cn(
          "flex items-center gap-2",
          compact ? "" : "mt-3"
        )}>
          <Button
            variant="outline"
            size={compact ? "sm" : "default"}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload Files
          </Button>
          <Button
            variant="outline"
            size={compact ? "sm" : "default"}
            onClick={() => folderInputRef.current?.click()}
            type="button"
          >
            <FolderOpen className="h-4 w-4 mr-2" />
            Upload Folder
          </Button>
        </div>
      </div>

      {/* Hidden file input for individual files */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".tif,.tiff,.png,.jpg,.jpeg,image/*"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />
      
      {/* Hidden folder input */}
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error - webkitdirectory is not in the type definition
        webkitdirectory=""
        directory=""
        multiple
        className="hidden"
        onChange={handleFolderInput}
      />
    </div>
  );
}
