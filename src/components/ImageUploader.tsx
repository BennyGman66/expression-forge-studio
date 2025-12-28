import { useCallback, useState } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ImageUploaderProps {
  onUpload: (urls: { url: string; fileName: string }[]) => void;
  folder: string;
  multiple?: boolean;
  className?: string;
}

export function ImageUploader({ onUpload, folder, multiple = true, className }: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    
    setIsUploading(true);
    setUploadProgress(0);
    
    const uploadedUrls: { url: string; fileName: string }[] = [];
    
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileExt = file.name.split('.').pop();
        const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('images')
          .upload(fileName, file);
        
        if (uploadError) {
          console.error('Upload error:', uploadError);
          toast.error(`Failed to upload ${file.name}`);
          continue;
        }
        
        const { data: { publicUrl } } = supabase.storage
          .from('images')
          .getPublicUrl(fileName);
        
        uploadedUrls.push({ url: publicUrl, fileName: file.name });
        setUploadProgress(Math.round(((i + 1) / files.length) * 100));
      }
      
      if (uploadedUrls.length > 0) {
        onUpload(uploadedUrls);
        toast.success(`Uploaded ${uploadedUrls.length} image${uploadedUrls.length > 1 ? 's' : ''}`);
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Upload failed');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files).filter(file => 
      file.type.startsWith('image/')
    );
    
    uploadFiles(multiple ? files : files.slice(0, 1));
  }, [multiple]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      uploadFiles(multiple ? files : files.slice(0, 1));
    }
  };

  return (
    <div
      className={cn(
        "relative border-2 border-dashed rounded-xl p-8 transition-all",
        isDragging 
          ? "border-primary bg-primary/5" 
          : "border-border hover:border-primary/50",
        className
      )}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept="image/*"
        multiple={multiple}
        onChange={handleFileSelect}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        disabled={isUploading}
      />
      
      <div className="flex flex-col items-center gap-4 pointer-events-none">
        {isUploading ? (
          <>
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <div className="text-center">
              <p className="font-medium">Uploading...</p>
              <p className="text-sm text-muted-foreground">{uploadProgress}%</p>
            </div>
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
              <Upload className="w-7 h-7 text-primary" />
            </div>
            <div className="text-center">
              <p className="font-medium">
                Drop images here or click to upload
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                PNG, JPG, WEBP up to 10MB each
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface ImageThumbnailProps {
  src: string;
  alt?: string;
  onRemove?: () => void;
  selected?: boolean;
  onClick?: () => void;
}

export function ImageThumbnail({ src, alt, onRemove, selected, onClick }: ImageThumbnailProps) {
  return (
    <div 
      className={cn(
        "image-thumbnail group",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
      onClick={onClick}
    >
      <img src={src} alt={alt || "Uploaded image"} loading="lazy" />
      
      {onRemove && (
        <Button
          variant="destructive"
          size="icon"
          className="absolute top-1 right-1 w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
        >
          <X className="w-3 h-3" />
        </Button>
      )}
    </div>
  );
}
