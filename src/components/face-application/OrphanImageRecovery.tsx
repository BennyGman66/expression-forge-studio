import React, { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getImageUrl } from "@/lib/imageUtils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { extractLookKey, inferViewType } from "@/lib/tiffImportUtils";
import { Search, Trash2, Download, Loader2, FolderSearch, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface OrphanedImage {
  storagePath: string;
  publicUrl: string;
  filename: string;
  inferredLookKey: string | null;
  inferredView: string;
}

interface OrphanGroup {
  lookKey: string;
  images: OrphanedImage[];
}

interface OrphanImageRecoveryProps {
  projectId: string;
  existingLookNames: string[];
  onRecovered: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrphanImageRecovery({
  projectId,
  existingLookNames,
  onRecovered,
  open,
  onOpenChange,
}: OrphanImageRecoveryProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [orphanedImages, setOrphanedImages] = useState<OrphanedImage[]>([]);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [isRecovering, setIsRecovering] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const { toast } = useToast();

  const scanForOrphans = useCallback(async () => {
    setIsScanning(true);
    setOrphanedImages([]);
    setSelectedImages(new Set());

    try {
      // List all files in the project's converted folder
      const { data: convertedFiles, error: listError } = await supabase.storage
        .from("images")
        .list(`face-application/${projectId}/converted`, {
          limit: 1000,
          sortBy: { column: "name", order: "asc" },
        });

      if (listError) {
        console.error("Error listing storage:", listError);
        toast({
          title: "Scan failed",
          description: listError.message,
          variant: "destructive",
        });
        setIsScanning(false);
        return;
      }

      // Also check uploads folder
      const { data: uploadFiles } = await supabase.storage
        .from("images")
        .list(`face-application/${projectId}/uploads`, {
          limit: 1000,
          sortBy: { column: "name", order: "asc" },
        });

      const allStorageFiles = [
        ...(convertedFiles || []).map((f) => ({
          ...f,
          folder: "converted",
        })),
        ...(uploadFiles || []).map((f) => ({
          ...f,
          folder: "uploads",
        })),
      ].filter((f) => f.name && !f.name.startsWith(".")); // Filter out placeholder files

      if (allStorageFiles.length === 0) {
        toast({
          title: "No files found",
          description: "No images found in storage for this project.",
        });
        setIsScanning(false);
        setHasScanned(true);
        return;
      }

      // Get all look_source_images URLs for this project
      const { data: looks } = await supabase
        .from("talent_looks")
        .select("id")
        .eq("project_id", projectId);

      const lookIds = (looks || []).map((l) => l.id);
      
      let dbUrls = new Set<string>();
      if (lookIds.length > 0) {
        const { data: dbImages } = await supabase
          .from("look_source_images")
          .select("source_url")
          .in("look_id", lookIds);

        dbUrls = new Set((dbImages || []).map((img) => img.source_url));
      }

      // Find orphaned files
      const orphans: OrphanedImage[] = [];
      for (const file of allStorageFiles) {
        const storagePath = `face-application/${projectId}/${file.folder}/${file.name}`;
        const { data: urlData } = supabase.storage
          .from("images")
          .getPublicUrl(storagePath);

        if (!dbUrls.has(urlData.publicUrl)) {
          orphans.push({
            storagePath,
            publicUrl: urlData.publicUrl,
            filename: file.name,
            inferredLookKey: extractLookKey(file.name),
            inferredView: inferViewType(file.name),
          });
        }
      }

      setOrphanedImages(orphans);
      setHasScanned(true);

      if (orphans.length === 0) {
        toast({
          title: "No orphaned images",
          description: "All storage images are linked to looks in the database.",
        });
      } else {
        toast({
          title: `Found ${orphans.length} orphaned image${orphans.length !== 1 ? "s" : ""}`,
          description: "Select images to recover or delete.",
        });
      }
    } catch (error: any) {
      console.error("Scan error:", error);
      toast({
        title: "Scan failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
    }
  }, [projectId, toast]);

  const toggleImage = (publicUrl: string) => {
    setSelectedImages((prev) => {
      const next = new Set(prev);
      if (next.has(publicUrl)) {
        next.delete(publicUrl);
      } else {
        next.add(publicUrl);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedImages(new Set(orphanedImages.map((img) => img.publicUrl)));
  };

  const selectNone = () => {
    setSelectedImages(new Set());
  };

  const recoverSelected = async () => {
    if (selectedImages.size === 0) return;

    setIsRecovering(true);
    const imagesToRecover = orphanedImages.filter((img) =>
      selectedImages.has(img.publicUrl)
    );

    // Group by lookKey
    const groups = new Map<string, OrphanedImage[]>();
    for (const img of imagesToRecover) {
      const key = img.inferredLookKey || "UNMATCHED";
      const existing = groups.get(key) || [];
      existing.push(img);
      groups.set(key, existing);
    }

    // Get a default talent_id
    const { data: talentData } = await supabase
      .from("talents")
      .select("id")
      .limit(1)
      .single();

    if (!talentData) {
      toast({
        title: "Error",
        description: "No talent found",
        variant: "destructive",
      });
      setIsRecovering(false);
      return;
    }

    let recoveredCount = 0;
    for (const [lookKey, images] of groups) {
      // Check if a look with this name exists
      const lookName = lookKey === "UNMATCHED" ? `Recovered ${Date.now()}` : lookKey;
      
      let lookId: string | null = null;
      const { data: existingLook } = await supabase
        .from("talent_looks")
        .select("id")
        .eq("project_id", projectId)
        .eq("name", lookName)
        .maybeSingle();

      if (existingLook) {
        lookId = existingLook.id;
      } else {
        // Create new look
        const { data: newLook, error } = await supabase
          .from("talent_looks")
          .insert({
            name: lookName,
            talent_id: talentData.id,
            project_id: projectId,
            digital_talent_id: null,
          })
          .select()
          .single();

        if (error || !newLook) {
          console.error("Failed to create look:", error);
          continue;
        }
        lookId = newLook.id;
      }

      // Insert images
      for (const img of images) {
        const view = img.inferredView === "unassigned" ? "front" : img.inferredView;
        
        // Check if this URL already exists for this look
        const { data: existing } = await supabase
          .from("look_source_images")
          .select("id")
          .eq("look_id", lookId)
          .eq("source_url", img.publicUrl)
          .maybeSingle();

        if (!existing) {
          const { error } = await supabase
            .from("look_source_images")
            .insert({
              look_id: lookId,
              view,
              source_url: img.publicUrl,
            });

          if (!error) {
            recoveredCount++;
          }
        }
      }
    }

    toast({
      title: "Recovery complete",
      description: `Recovered ${recoveredCount} image${recoveredCount !== 1 ? "s" : ""}.`,
    });

    // Remove recovered images from the list
    setOrphanedImages((prev) =>
      prev.filter((img) => !selectedImages.has(img.publicUrl))
    );
    setSelectedImages(new Set());
    setIsRecovering(false);
    onRecovered();
  };

  const deleteSelected = async () => {
    if (selectedImages.size === 0) return;

    setIsDeleting(true);
    const imagesToDelete = orphanedImages.filter((img) =>
      selectedImages.has(img.publicUrl)
    );

    let deletedCount = 0;
    for (const img of imagesToDelete) {
      const { error } = await supabase.storage
        .from("images")
        .remove([img.storagePath]);

      if (!error) {
        deletedCount++;
      } else {
        console.error("Failed to delete:", img.storagePath, error);
      }
    }

    toast({
      title: "Deletion complete",
      description: `Deleted ${deletedCount} file${deletedCount !== 1 ? "s" : ""} from storage.`,
    });

    // Remove deleted images from the list
    setOrphanedImages((prev) =>
      prev.filter((img) => !selectedImages.has(img.publicUrl))
    );
    setSelectedImages(new Set());
    setIsDeleting(false);
  };

  // Extract timestamp from filename (e.g., "1768149071537-eae0kd..." -> 1768149071537)
  const extractTimestamp = (filename: string): number => {
    const match = filename.match(/^(\d{13})/);
    return match ? parseInt(match[1], 10) : 0;
  };

  // Group orphaned images by inferred look key for display, sorted by newest first
  const groupedOrphans: OrphanGroup[] = React.useMemo(() => {
    const groups = new Map<string, OrphanedImage[]>();
    for (const img of orphanedImages) {
      const key = img.inferredLookKey || "UNMATCHED";
      const existing = groups.get(key) || [];
      existing.push(img);
      groups.set(key, existing);
    }
    return Array.from(groups.entries())
      .map(([lookKey, images]) => ({
        lookKey,
        // Sort images within group by timestamp (newest first)
        images: images.sort((a, b) => 
          extractTimestamp(b.filename) - extractTimestamp(a.filename)
        ),
      }))
      .sort((a, b) => {
        // UNMATCHED always at the bottom
        if (a.lookKey === "UNMATCHED") return 1;
        if (b.lookKey === "UNMATCHED") return -1;
        // Sort groups by their newest image (descending - newest first)
        const aMaxTime = Math.max(...a.images.map(img => extractTimestamp(img.filename)));
        const bMaxTime = Math.max(...b.images.map(img => extractTimestamp(img.filename)));
        return bMaxTime - aMaxTime;
      });
  }, [orphanedImages]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderSearch className="h-5 w-5" />
            Recover Orphaned Images
          </DialogTitle>
          <DialogDescription>
            Scan storage for images that were uploaded but not saved to the database.
            This can happen if an import was interrupted.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0">
          {!hasScanned ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <AlertCircle className="h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center max-w-md">
                Click "Scan Storage" to find images in storage that aren't linked to any looks.
              </p>
              <Button onClick={scanForOrphans} disabled={isScanning}>
                {isScanning ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Scan Storage
                  </>
                )}
              </Button>
            </div>
          ) : orphanedImages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="text-green-500">
                <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm text-muted-foreground">
                No orphaned images found. All storage images are linked to looks.
              </p>
              <Button variant="outline" onClick={scanForOrphans} disabled={isScanning}>
                {isScanning ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  "Scan Again"
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {orphanedImages.length} orphaned image{orphanedImages.length !== 1 ? "s" : ""} found
                  {selectedImages.size > 0 && ` · ${selectedImages.size} selected`}
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAll}>
                    Select All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={selectNone}>
                    Select None
                  </Button>
                  <Button variant="outline" size="sm" onClick={scanForOrphans} disabled={isScanning}>
                    {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : "Rescan"}
                  </Button>
                </div>
              </div>

              <ScrollArea className="h-[400px] border rounded-lg">
                <div className="p-4 space-y-6">
                  {groupedOrphans.map((group) => (
                    <div key={group.lookKey} className="space-y-2">
                      <h4 className="font-medium text-sm flex items-center gap-2">
                        {group.lookKey === "UNMATCHED" ? (
                          <span className="text-muted-foreground">Unmatched Files</span>
                        ) : (
                          <>
                            <span>{group.lookKey}</span>
                            {existingLookNames.includes(group.lookKey) && (
                              <span className="text-xs bg-green-500/10 text-green-600 px-2 py-0.5 rounded">
                                Existing Look
                              </span>
                            )}
                          </>
                        )}
                        <span className="text-muted-foreground font-normal">
                          ({group.images.length} image{group.images.length !== 1 ? "s" : ""})
                        </span>
                      </h4>
                      <div className="grid grid-cols-4 gap-2">
                        {group.images.map((img) => (
                          <div
                            key={img.publicUrl}
                            className={`relative border rounded-lg overflow-hidden cursor-pointer transition-all ${
                              selectedImages.has(img.publicUrl)
                                ? "ring-2 ring-primary"
                                : "hover:border-primary/50"
                            }`}
                            onClick={() => toggleImage(img.publicUrl)}
                          >
                            <div className="aspect-[3/4] bg-muted">
                              <img
                                src={getImageUrl(img.publicUrl, 'tiny')}
                                alt={img.filename}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            </div>
                            <div className="absolute top-2 left-2">
                              <Checkbox
                                checked={selectedImages.has(img.publicUrl)}
                                className="bg-background"
                              />
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                              <p className="text-xs text-white truncate">{img.filename}</p>
                              <p className="text-xs text-white/70">{img.inferredView}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0">
          {orphanedImages.length > 0 && (
            <div className="flex items-center gap-2 w-full justify-between">
              <Button
                variant="destructive"
                onClick={deleteSelected}
                disabled={selectedImages.size === 0 || isDeleting || isRecovering}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Selected
                  </>
                )}
              </Button>
              <Button
                onClick={recoverSelected}
                disabled={selectedImages.size === 0 || isRecovering || isDeleting}
              >
                {isRecovering ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Recovering...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Recover Selected ({selectedImages.size})
                  </>
                )}
              </Button>
            </div>
          )}
          {orphanedImages.length === 0 && hasScanned && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
