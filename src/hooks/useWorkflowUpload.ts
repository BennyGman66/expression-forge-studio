import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { 
  ParsedUploadFile, 
  UploadSummary, 
  WorkflowView,
  OutputFormat,
} from '@/types/optimised-workflow';
import { useToast } from '@/hooks/use-toast';

// Check if file is a TIFF
function isTiff(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext === 'tif' || ext === 'tiff' || file.type === 'image/tiff';
}

// Extract look code from filename (e.g., "01_MWOMW39826DW5 short#008.tif" -> "MWOMW39826DW5")
function extractLookCode(filename: string): string {
  // Remove extension
  const nameWithoutExt = filename.replace(/\.(tiff?|jpe?g|png|webp)$/i, '');
  
  // Common patterns to try:
  // 1. Underscore-separated with code at position 1 or 2
  // 2. Space-separated with code at position 0 or 1
  // 3. Alphanumeric code of 8+ characters
  
  // Pattern 1: Look for 8+ character alphanumeric code
  const alphaNumMatch = nameWithoutExt.match(/[A-Z0-9]{8,}/i);
  if (alphaNumMatch) {
    return alphaNumMatch[0].toUpperCase();
  }

  // Pattern 2: Split by common separators and find longest segment
  const segments = nameWithoutExt.split(/[_\s\-#]+/);
  const validSegments = segments.filter(s => s.length >= 6 && /^[A-Z0-9]+$/i.test(s));
  if (validSegments.length > 0) {
    return validSegments.sort((a, b) => b.length - a.length)[0].toUpperCase();
  }

  // Fallback: use cleaned filename
  return nameWithoutExt.replace(/[^A-Z0-9]/gi, '').slice(0, 20).toUpperCase() || 'UNKNOWN';
}

// Infer view type from filename keywords
function inferViewType(filename: string): WorkflowView | 'unknown' {
  const lower = filename.toLowerCase();
  
  if (lower.includes('full_front') || lower.includes('full-front') || lower.includes('fulfront')) {
    return 'full_front';
  }
  if (lower.includes('cropped_front') || lower.includes('cropped-front') || lower.includes('cropfront')) {
    return 'cropped_front';
  }
  if (lower.includes('front') && !lower.includes('back')) {
    return 'full_front'; // Default front to full_front
  }
  if (lower.includes('back') || lower.includes('rear')) {
    return 'back';
  }
  if (lower.includes('detail') || lower.includes('close')) {
    return 'detail';
  }
  if (lower.includes('side') || lower.includes('profile')) {
    return 'side';
  }
  
  return 'unknown';
}

// Check if file is a supported image
function isSupportedImage(file: File): boolean {
  const supportedTypes = ['image/tiff', 'image/jpeg', 'image/png', 'image/webp'];
  const supportedExtensions = ['.tif', '.tiff', '.jpg', '.jpeg', '.png', '.webp'];
  
  if (supportedTypes.includes(file.type)) return true;
  
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  return supportedExtensions.includes(ext);
}

// Simple hash function for file content (not cryptographic, but fast)
async function generateFileChecksum(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  
  // Simple hash: sample bytes at intervals and combine
  let hash = 0;
  const step = Math.max(1, Math.floor(bytes.length / 1000));
  
  for (let i = 0; i < bytes.length; i += step) {
    hash = ((hash << 5) - hash + bytes[i]) | 0;
  }
  
  return `${hash.toString(16)}-${file.size}-${file.lastModified}`;
}

// Get all files from a dropped folder
async function getFilesFromEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((resolve) => {
      (entry as FileSystemFileEntry).file(
        (file) => resolve(isSupportedImage(file) ? [file] : []),
        () => resolve([])
      );
    });
  }
  
  if (entry.isDirectory) {
    const dirReader = (entry as FileSystemDirectoryEntry).createReader();
    const files: File[] = [];
    
    const readEntries = (): Promise<FileSystemEntry[]> => {
      return new Promise((resolve) => {
        dirReader.readEntries(
          (entries) => resolve(entries),
          () => resolve([])
        );
      });
    };

    let entries = await readEntries();
    while (entries.length > 0) {
      for (const e of entries) {
        const subFiles = await getFilesFromEntry(e);
        files.push(...subFiles);
      }
      entries = await readEntries();
    }
    
    return files;
  }
  
  return [];
}

export async function getFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const files: File[] = [];
  
  if (dataTransfer.items) {
    const entries = Array.from(dataTransfer.items)
      .map(item => item.webkitGetAsEntry())
      .filter((entry): entry is FileSystemEntry => entry !== null);
    
    for (const entry of entries) {
      const entryFiles = await getFilesFromEntry(entry);
      files.push(...entryFiles);
    }
  } else {
    // Fallback for browsers without webkitGetAsEntry
    files.push(...Array.from(dataTransfer.files).filter(isSupportedImage));
  }
  
  return files;
}

export function useWorkflowUpload(projectId: string | null) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Parse files and check for duplicates
  const parseFiles = useCallback(async (files: File[]): Promise<{ parsed: ParsedUploadFile[]; summary: UploadSummary }> => {
    if (!projectId) {
      return { 
        parsed: [], 
        summary: { 
          totalFiles: 0, 
          newFiles: 0, 
          duplicatesSkipped: 0, 
          looksCreated: 0, 
          looksUpdated: 0,
          byLookCode: new Map(),
          tiffCount: 0,
        } 
      };
    }

    const parsed: ParsedUploadFile[] = [];
    const byLookCode = new Map<string, ParsedUploadFile[]>();
    let tiffCount = 0;

    // Get existing looks and their checksums
    const { data: existingLooks } = await supabase
      .from('workflow_looks')
      .select('id, look_code')
      .eq('project_id', projectId);

    const { data: existingImages } = await supabase
      .from('workflow_images')
      .select('look_id, view, file_checksum')
      .in('look_id', (existingLooks || []).map(l => l.id));

    const existingChecksums = new Set(
      (existingImages || []).map(img => `${img.look_id}:${img.view}:${img.file_checksum}`)
    );

    const lookIdByCode = new Map(
      (existingLooks || []).map(l => [l.look_code, l.id])
    );

    // Process each file
    for (const file of files) {
      const lookCode = extractLookCode(file.name);
      const inferredView = inferViewType(file.name);
      const checksum = await generateFileChecksum(file);
      const needsConversion = isTiff(file);
      
      if (needsConversion) tiffCount++;
      
      const lookId = lookIdByCode.get(lookCode);
      const isDuplicate = lookId 
        ? existingChecksums.has(`${lookId}:${inferredView}:${checksum}`)
        : false;

      const parsedFile: ParsedUploadFile = {
        file,
        lookCode,
        inferredView,
        filename: file.name,
        isDuplicate,
        needsConversion,
      };

      parsed.push(parsedFile);

      if (!byLookCode.has(lookCode)) {
        byLookCode.set(lookCode, []);
      }
      byLookCode.get(lookCode)!.push(parsedFile);
    }

    const newFiles = parsed.filter(p => !p.isDuplicate).length;
    const duplicatesSkipped = parsed.filter(p => p.isDuplicate).length;
    const existingLookCodes = new Set((existingLooks || []).map(l => l.look_code));
    const looksCreated = [...byLookCode.keys()].filter(code => !existingLookCodes.has(code)).length;
    const looksUpdated = [...byLookCode.keys()].filter(code => existingLookCodes.has(code)).length;

    return {
      parsed,
      summary: {
        totalFiles: files.length,
        newFiles,
        duplicatesSkipped,
        looksCreated,
        looksUpdated,
        byLookCode,
        tiffCount,
      },
    };
  }, [projectId]);

  // Upload files and create looks
  const uploadMutation = useMutation({
    mutationFn: async ({ files, targetFormat }: { files: ParsedUploadFile[]; targetFormat: OutputFormat }) => {
      if (!projectId) throw new Error('No project selected');

      const filesToUpload = files.filter(p => !p.isDuplicate);
      if (filesToUpload.length === 0) {
        return { uploaded: 0, looks: 0, converted: 0 };
      }

      setIsProcessing(true);
      setUploadProgress(0);

      // Group by look code
      const byLookCode = new Map<string, ParsedUploadFile[]>();
      filesToUpload.forEach(file => {
        if (!byLookCode.has(file.lookCode)) {
          byLookCode.set(file.lookCode, []);
        }
        byLookCode.get(file.lookCode)!.push(file);
      });

      // Get or create looks
      const lookIds = new Map<string, string>();
      const { data: existingLooks } = await supabase
        .from('workflow_looks')
        .select('id, look_code')
        .eq('project_id', projectId)
        .in('look_code', [...byLookCode.keys()]);

      (existingLooks || []).forEach(look => {
        lookIds.set(look.look_code, look.id);
      });

      // Create new looks
      const newLookCodes = [...byLookCode.keys()].filter(code => !lookIds.has(code));
      if (newLookCodes.length > 0) {
        const { data: newLooks, error } = await supabase
          .from('workflow_looks')
          .insert(newLookCodes.map(code => ({
            project_id: projectId,
            look_code: code,
            name: code,
            stage: 'LOOKS_UPLOADED' as const,
          })))
          .select();

        if (error) throw error;
        (newLooks || []).forEach(look => {
          lookIds.set(look.look_code, look.id);
        });
      }

      // Upload images
      let uploaded = 0;
      let converted = 0;
      const total = filesToUpload.length;
      const needsConversion = targetFormat !== 'original';

      for (const file of filesToUpload) {
        const lookId = lookIds.get(file.lookCode);
        if (!lookId) continue;

        const checksum = await generateFileChecksum(file.file);
        const originalExt = file.filename.split('.').pop()?.toLowerCase() || 'jpg';
        const finalExt = needsConversion ? targetFormat : originalExt;
        const storagePath = `workflow/${projectId}/${lookId}/${Date.now()}-${file.inferredView}.${finalExt}`;

        // Upload original to temp path first
        const tempPath = `workflow/${projectId}/${lookId}/temp-${Date.now()}.${originalExt}`;
        const { error: uploadError } = await supabase.storage
          .from('images')
          .upload(tempPath, file.file);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          continue;
        }

        // Get temp URL for conversion
        const { data: { publicUrl: tempUrl } } = supabase.storage
          .from('images')
          .getPublicUrl(tempPath);

        let finalUrl = tempUrl;

        // Convert if needed
        if (needsConversion) {
          try {
            const { data: conversionResult, error: conversionError } = await supabase.functions
              .invoke('convert-image', {
                body: {
                  sourceUrl: tempUrl,
                  targetFormat: targetFormat === 'jpeg' ? 'jpeg' : targetFormat,
                  targetPath: storagePath,
                  quality: targetFormat === 'png' ? 100 : 90,
                },
              });

            if (conversionError) {
              console.error('Conversion error:', conversionError);
              finalUrl = tempUrl; // Fall back to original
            } else if (conversionResult?.convertedUrl) {
              finalUrl = conversionResult.convertedUrl;
              converted++;
              
              // Delete temp file
              await supabase.storage.from('images').remove([tempPath]);
            }
          } catch (err) {
            console.error('Conversion failed:', err);
            finalUrl = tempUrl;
          }
        } else {
          // Move from temp to final path
          const { error: moveError } = await supabase.storage
            .from('images')
            .move(tempPath, storagePath);
          
          if (!moveError) {
            const { data: { publicUrl } } = supabase.storage
              .from('images')
              .getPublicUrl(storagePath);
            finalUrl = publicUrl;
          }
        }

        // Create image record
        await supabase.from('workflow_images').insert({
          look_id: lookId,
          view: file.inferredView === 'unknown' ? 'full_front' : file.inferredView,
          original_url: finalUrl,
          file_checksum: checksum,
          filename: file.filename,
        });

        uploaded++;
        setUploadProgress(Math.round((uploaded / total) * 100));
      }

      return { uploaded, looks: lookIds.size, converted };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['workflow-looks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['workflow-project', projectId] });
      
      const conversionNote = result.converted > 0 ? ` (${result.converted} converted)` : '';
      toast({
        title: 'Upload complete',
        description: `${result.uploaded} images uploaded across ${result.looks} looks${conversionNote}.`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setIsProcessing(false);
      setUploadProgress(0);
    },
  });

  return {
    parseFiles,
    uploadFiles: (files: ParsedUploadFile[], targetFormat: OutputFormat = 'original') => 
      uploadMutation.mutate({ files, targetFormat }),
    isProcessing: isProcessing || uploadMutation.isPending,
    uploadProgress,
  };
}
