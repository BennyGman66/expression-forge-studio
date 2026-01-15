import { useState, useCallback, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  FolderOpen,
  Upload,
  Edit2,
  Image as ImageIcon,
  RefreshCw,
  Play,
  SkipForward,
  FileCheck,
  FileWarning,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ParsedFile,
  LookGroup,
  PreflightFile,
  PreflightSummary,
  ExistingLookData,
  parseFile,
  groupFilesByLook,
  renameLookGroup,
  updateFileView,
  isTiffFile,
  runPreflightCheck,
} from "@/lib/tiffImportUtils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ImageWithView {
  url: string;
  view: 'front' | 'back' | 'side' | 'detail' | 'unassigned';
  originalFilename: string;
}

// Callback for progressive image saving - called after each successful conversion
export interface ProgressiveImageData {
  url: string;
  view: 'front' | 'back' | 'side' | 'detail' | 'unassigned';
  originalFilename: string;
  lookKey: string | null;
}

interface TiffImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: File[];
  projectId: string;
  onComplete: (looks: { lookName: string; images: ImageWithView[] }[]) => void;
  /** Called after each successful conversion to save to DB immediately */
  onImageReady?: (imageData: ProgressiveImageData) => Promise<void>;
}

type ConversionStatus = "queued" | "uploading" | "converting" | "done" | "failed" | "skipped";

interface FileConversionState {
  file: PreflightFile;
  status: ConversionStatus;
  pngUrl: string | null;
  error: string | null;
  tiffStoragePath: string | null;
  uploadProgress: number;
}

type Step = "preflight" | "converting" | "grouping" | "committing";

export function TiffImportDialog({
  open,
  onOpenChange,
  files,
  projectId,
  onComplete,
  onImageReady,
}: TiffImportDialogProps) {
  const [step, setStep] = useState<Step>("preflight");
  const [conversionStates, setConversionStates] = useState<FileConversionState[]>([]);
  const [lookGroups, setLookGroups] = useState<LookGroup[]>([]);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [preflightSummary, setPreflightSummary] = useState<PreflightSummary | null>(null);
  const [isLoadingPreflight, setIsLoadingPreflight] = useState(false);
  
  // Use ref to track if conversion has started to prevent double-triggering
  const conversionStartedRef = useRef(false);
  // Track previous files to detect real changes
  const prevFilesRef = useRef<File[]>([]);

  // Reset all dialog state
  const resetState = useCallback(() => {
    setStep("preflight");
    setConversionStates([]);
    setLookGroups([]);
    setSelectedGroupKey(null);
    setEditingGroupKey(null);
    setEditingName("");
    setIsCommitting(false);
    setIsConverting(false);
    setPreflightSummary(null);
    setIsLoadingPreflight(false);
    conversionStartedRef.current = false;
    prevFilesRef.current = [];
  }, []);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open, resetState]);

  // Fetch existing looks and run preflight when files change
  useEffect(() => {
    if (open && files.length > 0) {
      const filesChanged = 
        files.length !== prevFilesRef.current.length ||
        files.some((f, i) => f !== prevFilesRef.current[i]);
      
      if (filesChanged) {
        console.log("[TiffImport] Files changed, running preflight for", files.length, "files");
        prevFilesRef.current = files;
        runPreflightAnalysis();
      }
    }
  }, [open, files]);

  const runPreflightAnalysis = async () => {
    setIsLoadingPreflight(true);
    setStep("preflight");
    
    try {
      // Parse all files
      const parsed = files.map(parseFile);
      
      // Get unique lookKeys to query
      const lookKeys = [...new Set(parsed.map(p => p.lookKey).filter(Boolean))] as string[];
      
      // Fetch existing looks by look_code or name
      const { data: existingLooks } = await supabase
        .from("talent_looks")
        .select("id, name, look_code")
        .eq("project_id", projectId);
      
      // Fetch existing views for those looks
      const lookIds = existingLooks?.map(l => l.id) || [];
      const { data: existingImages } = lookIds.length > 0
        ? await supabase
            .from("look_source_images")
            .select("look_id, view")
            .in("look_id", lookIds)
        : { data: [] };
      
      // Build ExistingLookData array
      const existingLookData: ExistingLookData[] = (existingLooks || []).map(look => ({
        id: look.id,
        name: look.name,
        look_code: look.look_code,
        views: (existingImages || [])
          .filter(img => img.look_id === look.id)
          .map(img => img.view),
      }));
      
      // Run preflight check
      const { files: preflightFiles, summary } = runPreflightCheck(parsed, existingLookData);
      
      setPreflightSummary(summary);
      setConversionStates(
        preflightFiles.map((file) => ({
          file,
          status: file.action === 'skip' ? 'skipped' : 'queued',
          pngUrl: null,
          error: file.skipReason || null,
          tiffStoragePath: null,
          uploadProgress: 0,
        }))
      );
      
      console.log("[TiffImport] Preflight complete:", summary);
    } catch (error) {
      console.error("[TiffImport] Preflight error:", error);
      toast.error("Failed to analyze files");
    } finally {
      setIsLoadingPreflight(false);
    }
  };

  const handleStartImport = () => {
    setStep("converting");
    conversionStartedRef.current = false;
    setIsConverting(false);
  };

  // Start conversion when entering conversion step
  useEffect(() => {
    if (
      open &&
      step === "converting" && 
      conversionStates.length > 0 && 
      !conversionStartedRef.current &&
      !isConverting
    ) {
      const hasQueued = conversionStates.some((s) => s.status === "queued");
      if (hasQueued) {
        console.log("[TiffImport] Starting conversion for", conversionStates.filter(s => s.status === "queued").length, "files");
        conversionStartedRef.current = true;
        startConversion();
      }
    }
  }, [open, step, conversionStates.length, isConverting]);

  // Upload with XMLHttpRequest for progress tracking
  const uploadWithProgress = async (
    file: File,
    path: string,
    index: number,
    contentType: string
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      const uploadUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/images/${path}`;
      
      const xhr = new XMLHttpRequest();
      xhr.open("POST", uploadUrl);
      xhr.setRequestHeader("Authorization", `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`);
      xhr.setRequestHeader("Content-Type", contentType);
      xhr.setRequestHeader("x-upsert", "true");
      
      xhr.timeout = 300000;
      
      let lastProgress = 0;
      let lastProgressTime = Date.now();
      let progressCheckInterval: number | undefined;
      
      progressCheckInterval = window.setInterval(() => {
        const timeSinceProgress = Date.now() - lastProgressTime;
        if (timeSinceProgress > 30000 && lastProgress < 100) {
          console.warn(`[TiffImport] Upload stalled at ${lastProgress}% for 30 seconds, aborting`);
          clearInterval(progressCheckInterval);
          xhr.abort();
        }
      }, 10000);
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          
          if (percent > lastProgress) {
            lastProgress = percent;
            lastProgressTime = Date.now();
          }
          
          setConversionStates((prev) =>
            prev.map((s, i) => (i === index ? { ...s, uploadProgress: percent } : s))
          );
        }
      };
      
      xhr.onload = () => {
        if (progressCheckInterval) clearInterval(progressCheckInterval);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText} - ${xhr.responseText}`));
        }
      };
      
      xhr.onerror = () => {
        if (progressCheckInterval) clearInterval(progressCheckInterval);
        reject(new Error("Upload network error - check connection"));
      };
      xhr.ontimeout = () => {
        if (progressCheckInterval) clearInterval(progressCheckInterval);
        reject(new Error("Upload timed out after 5 minutes"));
      };
      xhr.onabort = () => {
        if (progressCheckInterval) clearInterval(progressCheckInterval);
        reject(new Error("Upload was aborted - connection stalled"));
      };
      xhr.send(file);
    });
  };

  const uploadTiffToStorage = async (file: File, index: number): Promise<string> => {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const path = `face-application/${projectId}/temp-tiff/${timestamp}-${randomId}-${file.name}`;

    await uploadWithProgress(file, path, index, "image/tiff");
    return path;
  };

  const convertSingleFile = async (index: number, states: FileConversionState[]) => {
    const item = states[index];
    
    if (!item || item.status === 'skipped') {
      return;
    }
    
    try {
      let pngUrl: string;

      if (isTiffFile(item.file.file)) {
        setConversionStates((prev) =>
          prev.map((s, i) => (i === index ? { ...s, status: "uploading", uploadProgress: 0 } : s))
        );

        const tiffStoragePath = await uploadTiffToStorage(item.file.file, index);
        
        setConversionStates((prev) =>
          prev.map((s, i) => (i === index ? { ...s, tiffStoragePath, status: "converting" } : s))
        );

        const { data, error } = await supabase.functions.invoke("convert-tiff", {
          body: {
            tiffStoragePath,
            originalFilename: item.file.originalFilename,
            projectId,
          },
        });

        if (error) throw new Error(error.message);
        if (!data?.pngUrl) throw new Error("No PNG URL returned");
        
        pngUrl = data.pngUrl;
      } else {
        setConversionStates((prev) =>
          prev.map((s, i) => (i === index ? { ...s, status: "uploading", uploadProgress: 0 } : s))
        );
        pngUrl = await uploadDirectly(item.file.file, index);
      }

      setConversionStates((prev) =>
        prev.map((s, i) =>
          i === index ? { ...s, status: "done", pngUrl, error: null, uploadProgress: 100 } : s
        )
      );

      if (onImageReady) {
        try {
          await onImageReady({
            url: pngUrl,
            view: item.file.inferredView,
            originalFilename: item.file.originalFilename,
            lookKey: item.file.lookKey,
          });
        } catch (saveError) {
          console.warn(`[TiffImport] Failed to save ${item.file.originalFilename} to DB:`, saveError);
        }
      }
    } catch (error) {
      console.error(`Failed to convert ${item.file.originalFilename}:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setConversionStates((prev) =>
        prev.map((s, i) =>
          i === index
            ? { ...s, status: "failed", error: errorMessage }
            : s
        )
      );
    }
  };

  const startConversion = useCallback(async () => {
    if (isConverting) {
      console.log("[TiffImport] Already converting, skipping");
      return;
    }
    
    setIsConverting(true);
    console.log("[TiffImport] startConversion called");
    
    try {
      const currentStates = await new Promise<FileConversionState[]>((resolve) => {
        setConversionStates((prev) => {
          resolve(prev);
          return prev;
        });
      });
      
      const CONCURRENCY = 6;
      const queuedIndices = currentStates
        .map((s, i) => (s.status === "queued" ? i : -1))
        .filter((i) => i >= 0);
      
      console.log("[TiffImport] Found", queuedIndices.length, "queued files");
      
      if (queuedIndices.length === 0) {
        console.log("[TiffImport] No queued files to process");
        setIsConverting(false);
        return;
      }
      
      let currentQueueIndex = 0;

      const processNext = async () => {
        if (currentQueueIndex >= queuedIndices.length) return;
        
        const index = queuedIndices[currentQueueIndex++];
        await convertSingleFile(index, currentStates);
        await processNext();
      };

      const workers = Array(Math.min(CONCURRENCY, queuedIndices.length))
        .fill(null)
        .map(() => processNext());

      await Promise.all(workers);
      console.log("[TiffImport] All conversions complete");
    } catch (error) {
      console.error("[TiffImport] Conversion batch error:", error);
      toast.error("Some conversions failed. You can retry them individually.");
    } finally {
      setIsConverting(false);
    }
  }, [isConverting]);

  const uploadDirectly = async (file: File, index: number): Promise<string> => {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const path = `face-application/${projectId}/uploads/${timestamp}-${randomId}-${file.name}`;

    await uploadWithProgress(file, path, index, file.type);

    const { data } = supabase.storage.from("images").getPublicUrl(path);
    return data.publicUrl;
  };

  const completedCount = conversionStates.filter((s) => s.status === "done").length;
  const failedCount = conversionStates.filter((s) => s.status === "failed").length;
  const skippedCount = conversionStates.filter((s) => s.status === "skipped").length;
  const totalCount = conversionStates.length;
  const toProcessCount = totalCount - skippedCount;
  const processingCount = conversionStates.filter(
    (s) => s.status === "uploading" || s.status === "converting"
  ).length;
  const allDone = completedCount + failedCount === toProcessCount && processingCount === 0;

  const handleProceedToGrouping = () => {
    const successfulFiles = conversionStates
      .filter((s) => s.status === "done" && s.pngUrl)
      .map((s) => ({
        ...s.file,
        pngUrl: s.pngUrl!,
      }));

    const groups = groupFilesByLook(successfulFiles as unknown as ParsedFile[]);
    
    const groupsWithUrls = groups.map((g) => ({
      ...g,
      files: g.files.map((f) => {
        const state = conversionStates.find(
          (s) => s.file.originalFilename === f.originalFilename
        );
        return { ...f, pngUrl: state?.pngUrl };
      }),
    }));

    setLookGroups(groupsWithUrls as unknown as LookGroup[]);
    setSelectedGroupKey(groupsWithUrls[0]?.lookKey || null);
    setStep("grouping");
  };

  const handleRetrySingle = async (index: number) => {
    const freshStates = await new Promise<FileConversionState[]>((resolve) => {
      setConversionStates((prev) => {
        const updated = prev.map((s, i) =>
          i === index ? { ...s, status: "queued" as ConversionStatus, error: null, tiffStoragePath: null, uploadProgress: 0 } : s
        );
        resolve(updated);
        return updated;
      });
    });
    
    await convertSingleFile(index, freshStates);
  };

  const handleRetryFailed = async () => {
    const failedIndices = conversionStates
      .map((s, i) => (s.status === "failed" ? i : -1))
      .filter((i) => i >= 0);

    const freshStates = await new Promise<FileConversionState[]>((resolve) => {
      setConversionStates((prev) => {
        const updated = prev.map((s, i) =>
          failedIndices.includes(i) ? { ...s, status: "queued" as ConversionStatus, error: null, tiffStoragePath: null, uploadProgress: 0 } : s
        );
        resolve(updated);
        return updated;
      });
    });

    const CONCURRENCY = 6;
    let currentIndex = 0;

    const processNext = async () => {
      if (currentIndex >= failedIndices.length) return;
      const idx = failedIndices[currentIndex++];
      await convertSingleFile(idx, freshStates);
      await processNext();
    };

    const workers = Array(Math.min(CONCURRENCY, failedIndices.length))
      .fill(null)
      .map(() => processNext());

    await Promise.all(workers);
  };

  const handleRenameGroup = (lookKey: string, newName: string) => {
    setLookGroups((prev) => renameLookGroup(prev, lookKey, newName));
    setEditingGroupKey(null);
  };

  const handleViewChange = (lookKey: string, fileIndex: number, newView: ParsedFile['inferredView']) => {
    setLookGroups(prev => updateFileView(prev, lookKey, fileIndex, newView));
  };

  const handleQuickAssign = (pattern: 'front-back' | 'sequential') => {
    if (!selectedGroup) return;
    
    const views: ParsedFile['inferredView'][] = 
      pattern === 'front-back' 
        ? ['front', 'back'] 
        : ['front', 'back', 'side', 'detail'];
    
    selectedGroup.files.forEach((_, i) => {
      handleViewChange(selectedGroup.lookKey, i, views[i % views.length]);
    });
  };

  const handleCommit = async () => {
    setIsCommitting(true);
    setStep("committing");

    try {
      const createdLooks: { lookName: string; images: ImageWithView[] }[] = [];

      for (const group of lookGroups) {
        if (group.lookKey === "UNMATCHED" || group.files.length === 0) continue;

        const images: ImageWithView[] = group.files
          .filter((f: ParsedFile & { pngUrl?: string }) => f.pngUrl)
          .map((f: ParsedFile & { pngUrl?: string }) => ({
            url: f.pngUrl!,
            view: f.inferredView,
            originalFilename: f.originalFilename,
          }));

        if (images.length > 0) {
          createdLooks.push({
            lookName: group.lookName,
            images,
          });
        }
      }

      onComplete(createdLooks);
      toast.success(`Created ${createdLooks.length} looks with ${createdLooks.reduce((acc, l) => acc + l.images.length, 0)} images`);
      onOpenChange(false);
    } catch (error) {
      console.error("Commit error:", error);
      toast.error("Failed to create looks");
      setStep("grouping");
    } finally {
      setIsCommitting(false);
    }
  };

  const selectedGroup = lookGroups.find((g) => g.lookKey === selectedGroupKey);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Folder Import
          </DialogTitle>
          <DialogDescription>
            {step === "preflight" && "Analyzing files for duplicates..."}
            {step === "converting" && "Converting files to PNG..."}
            {step === "grouping" && "Review and adjust look groupings before importing"}
            {step === "committing" && "Creating looks..."}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 py-2 border-b">
          <Badge variant={step === "preflight" ? "default" : "secondary"}>
            1. Preflight
          </Badge>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <Badge variant={step === "converting" ? "default" : "secondary"}>
            2. Convert
          </Badge>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <Badge variant={step === "grouping" ? "default" : "secondary"}>
            3. Group
          </Badge>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <Badge variant={step === "committing" ? "default" : "secondary"}>
            4. Create
          </Badge>
        </div>

        {/* Step 0: Preflight */}
        {step === "preflight" && (
          <div className="flex-1 overflow-hidden flex flex-col gap-4 min-h-0">
            {isLoadingPreflight ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Analyzing {files.length} files...</p>
              </div>
            ) : preflightSummary ? (
              <>
                {/* Summary panel */}
                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <h3 className="font-medium text-sm">Import Summary</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="flex items-center gap-2">
                      <FileCheck className="h-5 w-5 text-green-500" />
                      <div>
                        <p className="text-2xl font-bold">{preflightSummary.willAdd}</p>
                        <p className="text-xs text-muted-foreground">Will add</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <SkipForward className="h-5 w-5 text-amber-500" />
                      <div>
                        <p className="text-2xl font-bold">{preflightSummary.willSkip}</p>
                        <p className="text-xs text-muted-foreground">Will skip (duplicates)</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <FileWarning className="h-5 w-5 text-orange-500" />
                      <div>
                        <p className="text-2xl font-bold">{preflightSummary.needsReview}</p>
                        <p className="text-xs text-muted-foreground">Needs review</p>
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground pt-2 border-t">
                    {preflightSummary.newLooks} new looks · {preflightSummary.existingLooks} existing looks will be updated
                  </div>
                </div>

                {/* File list */}
                <ScrollArea className="border rounded-lg flex-1">
                  <div className="p-2 space-y-1">
                    {conversionStates.map((state, index) => (
                      <div
                        key={index}
                        className={cn(
                          "flex items-center gap-2 py-1.5 px-2 rounded",
                          state.file.action === 'skip' && "opacity-50"
                        )}
                      >
                        {state.file.action === 'add' && (
                          <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                        )}
                        {state.file.action === 'skip' && (
                          <SkipForward className="h-4 w-4 text-amber-500 flex-shrink-0" />
                        )}
                        {state.file.action === 'needs_review' && (
                          <AlertCircle className="h-4 w-4 text-orange-500 flex-shrink-0" />
                        )}
                        
                        <span className="text-sm truncate flex-1">
                          {state.file.originalFilename}
                        </span>
                        
                        {state.file.lookKey && (
                          <Badge variant="outline" className="text-xs">
                            {state.file.lookKey}
                          </Badge>
                        )}
                        
                        <Badge 
                          variant="secondary" 
                          className={cn(
                            "text-xs",
                            state.file.inferredView === 'unassigned' && "bg-orange-100 text-orange-700"
                          )}
                        >
                          {state.file.inferredView}
                        </Badge>
                        
                        {state.file.skipReason && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                {state.file.skipReason}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">{state.file.skipReason}</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </>
            ) : null}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleStartImport}
                disabled={isLoadingPreflight || !preflightSummary || preflightSummary.willAdd === 0}
              >
                Start Import ({preflightSummary?.willAdd || 0} files)
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 1: Conversion */}
        {step === "converting" && (
          <div className="flex-1 overflow-hidden flex flex-col gap-4 min-h-0">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {processingCount > 0 || completedCount > 0 ? (
                  <>
                    Converting {completedCount} of {toProcessCount} images
                    {failedCount > 0 && (
                      <span className="text-destructive ml-2">
                        ({failedCount} failed)
                      </span>
                    )}
                    {skippedCount > 0 && (
                      <span className="text-amber-600 ml-2">
                        ({skippedCount} skipped)
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    {toProcessCount} images ready to convert
                    {skippedCount > 0 && ` (${skippedCount} skipped)`}
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetState}
                  title="Reset and start over"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                {!isConverting && conversionStates.some(s => s.status === "queued") && (
                  <Button 
                    size="sm" 
                    onClick={() => {
                      conversionStartedRef.current = true;
                      startConversion();
                    }}
                  >
                    <Play className="h-4 w-4 mr-1" />
                    Start Conversion
                  </Button>
                )}
                <Progress
                  value={(completedCount / toProcessCount) * 100}
                  className="w-48"
                />
              </div>
            </div>

            <ScrollArea className="border rounded-lg h-[50vh]">
              <div className="p-2 space-y-1">
                {conversionStates.map((state, index) => (
                  <div
                    key={index}
                    className={cn(
                      "flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50",
                      state.status === "skipped" && "opacity-50"
                    )}
                  >
                    {state.status === "queued" && (
                      <div className="h-4 w-4 rounded-full bg-muted" />
                    )}
                    {state.status === "skipped" && (
                      <SkipForward className="h-4 w-4 text-amber-500" />
                    )}
                    {(state.status === "uploading" || state.status === "converting") && (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    )}
                    {state.status === "done" && (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    )}
                    {state.status === "failed" && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <XCircle className="h-4 w-4 text-destructive cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">
                          <p className="text-xs break-all">{state.error || "Unknown error"}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    
                    <span className="text-sm truncate flex-1">
                      {state.file.originalFilename}
                    </span>
                    
                    {state.status === "uploading" && (
                      <div className="flex items-center gap-1.5">
                        <Progress value={state.uploadProgress} className="w-16 h-1.5" />
                        <span className="text-xs text-muted-foreground w-8">
                          {state.uploadProgress}%
                        </span>
                      </div>
                    )}
                    
                    {state.status === "converting" && (
                      <span className="text-xs text-muted-foreground">
                        Converting...
                      </span>
                    )}
                    
                    {state.status === "skipped" && (
                      <span className="text-xs text-amber-600">
                        Skipped
                      </span>
                    )}
                    
                    {state.file.lookKey && state.status !== "failed" && state.status !== "uploading" && state.status !== "converting" && state.status !== "skipped" && (
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${state.status === "done" ? "border-green-500 text-green-600 bg-green-50" : ""}`}
                      >
                        {state.file.lookKey}
                      </Badge>
                    )}
                    
                    {state.status === "failed" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs hover:bg-destructive/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRetrySingle(index);
                        }}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Retry
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              {failedCount > 0 && (
                <Button variant="secondary" onClick={handleRetryFailed}>
                  Retry All Failed ({failedCount})
                </Button>
              )}
              <Button
                onClick={handleProceedToGrouping}
                disabled={!allDone || completedCount === 0}
              >
                {allDone ? (
                  <>
                    Continue to Grouping
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </>
                ) : (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Converting...
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 2: Grouping */}
        {step === "grouping" && (
          <div className="flex-1 overflow-hidden flex flex-col gap-4">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>
                <FolderOpen className="h-4 w-4 inline mr-1" />
                {lookGroups.length} looks detected
              </span>
              <span>
                <ImageIcon className="h-4 w-4 inline mr-1" />
                {completedCount} images
              </span>
              {skippedCount > 0 && (
                <span className="text-amber-600">
                  <SkipForward className="h-4 w-4 inline mr-1" />
                  {skippedCount} skipped (duplicates)
                </span>
              )}
            </div>

            <div className="flex-1 grid grid-cols-[280px_1fr] gap-4 overflow-hidden">
              {/* Look groups list */}
              <ScrollArea className="border rounded-lg">
                <div className="p-2 space-y-1">
                  {lookGroups.map((group) => (
                    <div
                      key={group.lookKey}
                      className={cn(
                        "flex items-center gap-2 py-2 px-3 rounded cursor-pointer transition-colors",
                        selectedGroupKey === group.lookKey
                          ? "bg-primary/10 border border-primary/30"
                          : "hover:bg-muted/50"
                      )}
                      onClick={() => setSelectedGroupKey(group.lookKey)}
                    >
                      <div className="flex-1 min-w-0">
                        {editingGroupKey === group.lookKey ? (
                          <Input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onBlur={() =>
                              handleRenameGroup(group.lookKey, editingName)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleRenameGroup(group.lookKey, editingName);
                              }
                              if (e.key === "Escape") {
                                setEditingGroupKey(null);
                              }
                            }}
                            className="h-7 text-sm"
                            autoFocus
                          />
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">
                              {group.lookName}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingGroupKey(group.lookKey);
                                setEditingName(group.lookName);
                              }}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                      <Badge
                        variant={
                          group.lookKey === "UNMATCHED" ? "destructive" : "secondary"
                        }
                      >
                        {group.files.length}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Preview thumbnails with view selectors */}
              <ScrollArea className="border rounded-lg">
                <div className="p-4 space-y-4">
                  {selectedGroup ? (
                    <>
                      {/* Quick assign buttons */}
                      {selectedGroup.files.length > 1 && (
                        <div className="flex items-center gap-2 pb-2 border-b">
                          <span className="text-xs text-muted-foreground">Quick assign:</span>
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => handleQuickAssign('front-back')}
                          >
                            Front/Back
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => handleQuickAssign('sequential')}
                          >
                            F/B/S/D Sequence
                          </Button>
                        </div>
                      )}
                      
                      <div className="grid grid-cols-4 gap-3">
                        {selectedGroup.files.map((file: ParsedFile & { pngUrl?: string }, index) => (
                          <div
                            key={index}
                            className="aspect-[3/4] bg-muted rounded-lg overflow-hidden relative group"
                          >
                            {file.pngUrl ? (
                              <img
                                src={file.pngUrl}
                                alt={file.originalFilename}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="flex items-center justify-center h-full">
                                <ImageIcon className="h-8 w-8 text-muted-foreground" />
                              </div>
                            )}
                            {/* View selector overlay - always visible */}
                            <div className="absolute inset-x-0 bottom-0 bg-black/80 p-2 space-y-1">
                              <Select
                                value={file.inferredView}
                                onValueChange={(value: ParsedFile['inferredView']) => 
                                  handleViewChange(selectedGroup.lookKey, index, value)
                                }
                              >
                                <SelectTrigger className="h-7 text-xs bg-transparent border-white/30 text-white hover:bg-white/10">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="front">Front</SelectItem>
                                  <SelectItem value="back">Back</SelectItem>
                                  <SelectItem value="side">Side</SelectItem>
                                  <SelectItem value="detail">Detail</SelectItem>
                                  <SelectItem value="unassigned">Unassigned</SelectItem>
                                </SelectContent>
                              </Select>
                              <p className="text-[10px] text-white/70 truncate">
                                {file.originalFilename}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-32 text-muted-foreground">
                      Select a look to preview images
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Warning for unassigned views */}
            {lookGroups.some((g) => 
              g.lookKey !== "UNMATCHED" && g.files.some(f => f.inferredView === 'unassigned')
            ) && (
              <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded-lg">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                Some images have unassigned views. Set views to avoid duplicates.
              </div>
            )}

            {lookGroups.some((g) => g.lookKey === "UNMATCHED" && g.files.length > 0) && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {lookGroups.find((g) => g.lookKey === "UNMATCHED")?.files.length} files
                couldn't be matched to a look code. Review the "Unmatched Files"
                group.
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("converting")}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button onClick={handleCommit} disabled={lookGroups.filter(g => g.lookKey !== "UNMATCHED").length === 0}>
                Create {lookGroups.filter(g => g.lookKey !== "UNMATCHED").length} Looks
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3: Committing */}
        {step === "committing" && (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="text-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">Creating looks...</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
