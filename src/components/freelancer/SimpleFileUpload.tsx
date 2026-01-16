import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, X, FileImage } from 'lucide-react';

interface PendingFile {
  id: string;
  file: File;
  preview: string;
}

interface SimpleFileUploadProps {
  onFilesReady: (files: File[]) => void;
  disabled?: boolean;
  uploading?: boolean;
}

export function SimpleFileUpload({ onFilesReady, disabled, uploading }: SimpleFileUploadProps) {
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((files: FileList | null) => {
    console.log('[SimpleFileUpload] handleFiles called with:', files?.length, 'files');
    if (!files || files.length === 0) return;
    
    const newFiles: PendingFile[] = Array.from(files).map(file => {
      console.log('[SimpleFileUpload] Processing file:', file.name, file.type, file.size);
      return {
        id: crypto.randomUUID(),
        file,
        preview: file.type.startsWith('image/') && !file.name.toLowerCase().endsWith('.heic') 
          ? URL.createObjectURL(file) 
          : ''
      };
    });
    
    setPendingFiles(prev => [...prev, ...newFiles]);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('[SimpleFileUpload] Input change event fired');
    handleFiles(e.target.files);
    e.target.value = ''; // Reset for re-selection
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    console.log('[SimpleFileUpload] Drop event fired');
    
    // Try dataTransfer.files first, fallback to items
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    } else if (e.dataTransfer.items) {
      const files: File[] = [];
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const item = e.dataTransfer.items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        const dt = new DataTransfer();
        files.forEach(f => dt.items.add(f));
        handleFiles(dt.files);
      }
    }
  };

  const removeFile = (id: string) => {
    setPendingFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (file?.preview) URL.revokeObjectURL(file.preview);
      return prev.filter(f => f.id !== id);
    });
  };

  const handleUpload = () => {
    console.log('[SimpleFileUpload] Upload button clicked, files:', pendingFiles.length);
    onFilesReady(pendingFiles.map(p => p.file));
    // Clean up previews
    pendingFiles.forEach(p => p.preview && URL.revokeObjectURL(p.preview));
    setPendingFiles([]);
  };

  const handleBrowseClick = () => {
    console.log('[SimpleFileUpload] Browse button clicked, inputRef:', inputRef.current);
    inputRef.current?.click();
  };

  return (
    <div className="space-y-4">
      {/* Always-rendered hidden input */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="*/*"
        onChange={handleInputChange}
        className="sr-only"
        aria-hidden="true"
      />

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragOver ? 'border-primary bg-primary/5' : 'border-border'
        } ${disabled || uploading ? 'opacity-50 pointer-events-none' : ''}`}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); }}
        onDrop={handleDrop}
      >
        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground mb-3">
          Drag & drop files here
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || uploading}
          onClick={handleBrowseClick}
        >
          <Upload className="h-4 w-4 mr-2" />
          Browse Files
        </Button>
      </div>

      {/* Pending files preview */}
      {pendingFiles.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">
            {pendingFiles.length} file(s) selected
          </p>
          <div className="grid grid-cols-3 gap-2">
            {pendingFiles.map(pf => (
              <div key={pf.id} className="relative border rounded p-2">
                {pf.preview ? (
                  <img 
                    src={pf.preview} 
                    alt={pf.file.name}
                    className="w-full aspect-square object-cover rounded" 
                  />
                ) : (
                  <div className="w-full aspect-square bg-muted flex items-center justify-center rounded">
                    <FileImage className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <p className="text-xs truncate mt-1">{pf.file.name}</p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive hover:bg-destructive/90"
                  onClick={() => removeFile(pf.id)}
                >
                  <X className="h-3 w-3 text-white" />
                </Button>
              </div>
            ))}
          </div>
          <Button 
            onClick={handleUpload} 
            disabled={disabled || uploading} 
            className="w-full"
          >
            {uploading ? 'Uploading...' : `Upload ${pendingFiles.length} File(s)`}
          </Button>
        </div>
      )}
    </div>
  );
}
