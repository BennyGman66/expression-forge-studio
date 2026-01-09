import { useState, useCallback, useEffect } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ParsedFile,
  LookGroup,
  parseFile,
  groupFilesByLook,
  renameLookGroup,
  isTiffFile,
} from "@/lib/tiffImportUtils";

interface ImageWithView {
  url: string;
  view: 'front' | 'back' | 'side' | 'detail' | 'unassigned';
  originalFilename: string;
}

interface TiffImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: File[];
  projectId: string;
  onComplete: (looks: { lookName: string; images: ImageWithView[] }[]) => void;
}

type ConversionStatus = "queued" | "converting" | "done" | "failed";

interface FileConversionState {
  file: ParsedFile;
  status: ConversionStatus;
  pngUrl: string | null;
  error: string | null;
}

type Step = "converting" | "grouping" | "committing";

export function TiffImportDialog({
  open,
  onOpenChange,
  files,
  projectId,
  onComplete,
}: TiffImportDialogProps) {
  const [step, setStep] = useState<Step>("converting");
  const [conversionStates, setConversionStates] = useState<FileConversionState[]>([]);
  const [lookGroups, setLookGroups] = useState<LookGroup[]>([]);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);

  // Initialize conversion states when files change
  useEffect(() => {
    if (open && files.length > 0) {
      const parsed = files.map(parseFile);
      setConversionStates(
        parsed.map((file) => ({
          file,
          status: "queued",
          pngUrl: null,
          error: null,
        }))
      );
      setStep("converting");
      setLookGroups([]);
      setSelectedGroupKey(null);
    }
  }, [open, files]);

  // Start conversion when dialog opens
  useEffect(() => {
    if (step === "converting" && conversionStates.length > 0) {
      startConversion();
    }
  }, [step, conversionStates.length]);

  const startConversion = async () => {
    const CONCURRENCY = 3; // Process 3 files at a time
    const queue = [...conversionStates];
    let currentIndex = 0;

    const processNext = async () => {
      if (currentIndex >= queue.length) return;
      
      const index = currentIndex++;
      const item = queue[index];
      
      // Update status to converting
      setConversionStates((prev) =>
        prev.map((s, i) => (i === index ? { ...s, status: "converting" } : s))
      );

      try {
        let pngUrl: string;

        if (isTiffFile(item.file.file)) {
          // Convert TIFF to PNG via edge function
          const base64 = await fileToBase64(item.file.file);
          
          const { data, error } = await supabase.functions.invoke("convert-tiff", {
            body: {
              fileBase64: base64,
              originalFilename: item.file.originalFilename,
              projectId,
            },
          });

          if (error) throw new Error(error.message);
          if (!data?.pngUrl) throw new Error("No PNG URL returned");
          
          pngUrl = data.pngUrl;
        } else {
          // Upload non-TIFF files directly
          pngUrl = await uploadDirectly(item.file.file);
        }

        setConversionStates((prev) =>
          prev.map((s, i) =>
            i === index ? { ...s, status: "done", pngUrl } : s
          )
        );
      } catch (error) {
        console.error(`Failed to convert ${item.file.originalFilename}:`, error);
        setConversionStates((prev) =>
          prev.map((s, i) =>
            i === index
              ? { ...s, status: "failed", error: String(error) }
              : s
          )
        );
      }

      // Process next item
      await processNext();
    };

    // Start concurrent processing
    const workers = Array(Math.min(CONCURRENCY, queue.length))
      .fill(null)
      .map(() => processNext());

    await Promise.all(workers);
  };

  const uploadDirectly = async (file: File): Promise<string> => {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const path = `face-application/${projectId}/uploads/${timestamp}-${randomId}-${file.name}`;

    const { error } = await supabase.storage
      .from("images")
      .upload(path, file, { contentType: file.type });

    if (error) throw error;

    const { data } = supabase.storage.from("images").getPublicUrl(path);
    return data.publicUrl;
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const completedCount = conversionStates.filter((s) => s.status === "done").length;
  const failedCount = conversionStates.filter((s) => s.status === "failed").length;
  const totalCount = conversionStates.length;
  const allDone = completedCount + failedCount === totalCount;

  const handleProceedToGrouping = () => {
    // Create groups from successfully converted files
    const successfulFiles = conversionStates
      .filter((s) => s.status === "done" && s.pngUrl)
      .map((s) => ({
        ...s.file,
        pngUrl: s.pngUrl!,
      }));

    const groups = groupFilesByLook(successfulFiles as unknown as ParsedFile[]);
    
    // Attach pngUrl to each file in groups
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

  const handleRetryFailed = async () => {
    const failedIndices = conversionStates
      .map((s, i) => (s.status === "failed" ? i : -1))
      .filter((i) => i >= 0);

    // Reset failed to queued
    setConversionStates((prev) =>
      prev.map((s, i) =>
        failedIndices.includes(i) ? { ...s, status: "queued", error: null } : s
      )
    );

    // Restart conversion for failed files
    for (const index of failedIndices) {
      const item = conversionStates[index];
      
      setConversionStates((prev) =>
        prev.map((s, i) => (i === index ? { ...s, status: "converting" } : s))
      );

      try {
        let pngUrl: string;

        if (isTiffFile(item.file.file)) {
          const base64 = await fileToBase64(item.file.file);
          const { data, error } = await supabase.functions.invoke("convert-tiff", {
            body: {
              fileBase64: base64,
              originalFilename: item.file.originalFilename,
              projectId,
            },
          });

          if (error) throw new Error(error.message);
          if (!data?.pngUrl) throw new Error("No PNG URL returned");
          
          pngUrl = data.pngUrl;
        } else {
          pngUrl = await uploadDirectly(item.file.file);
        }

        setConversionStates((prev) =>
          prev.map((s, i) =>
            i === index ? { ...s, status: "done", pngUrl } : s
          )
        );
      } catch (error) {
        setConversionStates((prev) =>
          prev.map((s, i) =>
            i === index
              ? { ...s, status: "failed", error: String(error) }
              : s
          )
        );
      }
    }
  };

  const handleRenameGroup = (lookKey: string, newName: string) => {
    setLookGroups((prev) => renameLookGroup(prev, lookKey, newName));
    setEditingGroupKey(null);
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
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            TIFF Bulk Import
          </DialogTitle>
          <DialogDescription>
            {step === "converting" && "Converting TIFF files to PNG..."}
            {step === "grouping" && "Review and adjust look groupings before importing"}
            {step === "committing" && "Creating looks..."}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 py-2 border-b">
          <Badge variant={step === "converting" ? "default" : "secondary"}>
            1. Convert
          </Badge>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <Badge variant={step === "grouping" ? "default" : "secondary"}>
            2. Group
          </Badge>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <Badge variant={step === "committing" ? "default" : "secondary"}>
            3. Create
          </Badge>
        </div>

        {/* Step 1: Conversion */}
        {step === "converting" && (
          <div className="flex-1 overflow-hidden flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Converting {completedCount} of {totalCount} images
                {failedCount > 0 && (
                  <span className="text-destructive ml-2">
                    ({failedCount} failed)
                  </span>
                )}
              </div>
              <Progress
                value={(completedCount / totalCount) * 100}
                className="w-48"
              />
            </div>

            <ScrollArea className="flex-1 border rounded-lg">
              <div className="p-2 space-y-1">
                {conversionStates.map((state, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50"
                  >
                    {state.status === "queued" && (
                      <div className="h-4 w-4 rounded-full bg-muted" />
                    )}
                    {state.status === "converting" && (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    )}
                    {state.status === "done" && (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    )}
                    {state.status === "failed" && (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                    <span className="text-sm truncate flex-1">
                      {state.file.originalFilename}
                    </span>
                    {state.file.lookKey && (
                      <Badge variant="outline" className="text-xs">
                        {state.file.lookKey}
                      </Badge>
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
                  Retry Failed ({failedCount})
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

              {/* Preview thumbnails */}
              <ScrollArea className="border rounded-lg">
                <div className="p-4">
                  {selectedGroup ? (
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
                          <div className="absolute inset-x-0 bottom-0 bg-black/70 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <p className="text-xs text-white truncate">
                              {file.originalFilename}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-32 text-muted-foreground">
                      Select a look to preview images
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            {lookGroups.some((g) => g.lookKey === "UNMATCHED" && g.files.length > 0) && (
              <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded-lg">
                <AlertCircle className="h-4 w-4" />
                Some files couldn't be grouped automatically. Review the "Unmatched" group.
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("converting")}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button onClick={handleCommit}>
                Create {lookGroups.filter((g) => g.lookKey !== "UNMATCHED").length} Looks
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3: Committing */}
        {step === "committing" && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="text-muted-foreground">Creating looks...</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
