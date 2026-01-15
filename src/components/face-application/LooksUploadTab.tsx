import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Plus, ArrowRight, Image as ImageIcon, FolderOpen, FolderSearch, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { BulkUploadZone } from "./BulkUploadZone";
import { LooksTable, LookData, TalentOption } from "./LooksTable";
import { TiffImportDialog, ProgressiveImageData } from "./TiffImportDialog";
import { OrphanImageRecovery } from "./OrphanImageRecovery";
import { isTiffFile, extractLookKey } from "@/lib/tiffImportUtils";
import { DeleteDuplicatesDialog, countDuplicates } from "./DeleteDuplicatesDialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface LooksUploadTabProps {
  projectId: string;
  selectedLookId: string | null;
  setSelectedLookId: (id: string | null) => void;
  selectedTalentId: string | null;
  setSelectedTalentId: (id: string | null) => void;
  selectedLookIds: Set<string>;
  setSelectedLookIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  onContinue: () => void;
}

export function LooksUploadTab({
  projectId,
  selectedLookId,
  setSelectedLookId,
  selectedTalentId,
  setSelectedTalentId,
  selectedLookIds,
  setSelectedLookIds,
  onContinue,
}: LooksUploadTabProps) {
  const [talents, setTalents] = useState<TalentOption[]>([]);
  const [looks, setLooks] = useState<LookData[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingViews, setUploadingViews] = useState<Record<string, boolean>>({});
  const [bulkUploadState, setBulkUploadState] = useState<{
    isUploading: boolean;
    progress: { current: number; total: number };
  }>({ isUploading: false, progress: { current: 0, total: 0 } });
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newLookName, setNewLookName] = useState("");
  const [tiffImportFiles, setTiffImportFiles] = useState<File[]>([]);
  const [showTiffImport, setShowTiffImport] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [showDeleteDuplicates, setShowDeleteDuplicates] = useState(false);
  const { toast } = useToast();

  // Count duplicates for the button badge
  const duplicateCount = useMemo(() => countDuplicates(looks), [looks]);

  // Handler to clear state when TIFF dialog closes
  const handleTiffDialogClose = useCallback((open: boolean) => {
    setShowTiffImport(open);
    if (!open) {
      // Clear files when dialog closes to prevent stale state on re-open
      setTiffImportFiles([]);
    }
  }, []);

  // Fetch talents
  useEffect(() => {
    const fetchTalents = async () => {
      const { data } = await supabase
        .from("digital_talents")
        .select("id, name, front_face_url")
        .order("name");
      if (data) setTalents(data);
    };
    fetchTalents();
  }, []);

  // Fetch all looks for this project with their source images
  const fetchLooks = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    const { data: looksData } = await supabase
      .from("talent_looks")
      .select("id, name, product_type, digital_talent_id, created_at, look_code")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (!looksData) {
      setLooks([]);
      setLoading(false);
      return;
    }

    // Fetch source images for all looks
    const lookIds = looksData.map((l) => l.id);
    const { data: imagesData } = await supabase
      .from("look_source_images")
      .select("id, look_id, view, source_url")
      .in("look_id", lookIds);

    const looksWithImages: LookData[] = looksData.map((look) => ({
      ...look,
      sourceImages: (imagesData || []).filter((img) => img.look_id === look.id),
    }));

    setLooks(looksWithImages);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchLooks();
  }, [fetchLooks]);

  // Get a default talent_id for legacy table
  const getDefaultTalentId = async () => {
    const { data } = await supabase.from("talents").select("id").limit(1).single();
    return data?.id;
  };

  const handleCreateLook = async () => {
    if (!newLookName.trim()) return;

    const talentId = await getDefaultTalentId();
    if (!talentId) {
      toast({ title: "Error", description: "No talent found", variant: "destructive" });
      return;
    }

    const { data, error } = await supabase
      .from("talent_looks")
      .insert({
        name: newLookName.trim(),
        talent_id: talentId,
        project_id: projectId,
        digital_talent_id: null,
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    setLooks((prev) => [{ ...data, sourceImages: [] }, ...prev]);
    setNewLookName("");
    setShowCreateDialog(false);
    toast({ title: "Look created", description: `"${data.name}" has been created.` });
  };

  const handleUpdateLook = async (lookId: string, updates: Partial<LookData>) => {
    const { error } = await supabase
      .from("talent_looks")
      .update({
        name: updates.name,
        digital_talent_id: updates.digital_talent_id,
      })
      .eq("id", lookId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    setLooks((prev) =>
      prev.map((look) => (look.id === lookId ? { ...look, ...updates } : look))
    );
  };

  const handleDeleteLook = async (lookId: string) => {
    const { error } = await supabase.from("talent_looks").delete().eq("id", lookId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    setLooks((prev) => prev.filter((look) => look.id !== lookId));
    toast({ title: "Deleted", description: "Look has been deleted." });
  };

  const handleDuplicateLook = async (lookId: string) => {
    const original = looks.find((l) => l.id === lookId);
    if (!original) return;

    const talentId = await getDefaultTalentId();
    if (!talentId) return;

    const { data, error } = await supabase
      .from("talent_looks")
      .insert({
        name: `${original.name} (copy)`,
        talent_id: talentId,
        project_id: projectId,
        digital_talent_id: original.digital_talent_id,
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    // Duplicate images
    if (original.sourceImages.length > 0) {
      const newImages = original.sourceImages.map((img) => ({
        look_id: data.id,
        view: img.view,
        source_url: img.source_url,
        digital_talent_id: original.digital_talent_id,
      }));

      const { data: insertedImages } = await supabase
        .from("look_source_images")
        .insert(newImages)
        .select();

      setLooks((prev) => [
        { ...data, sourceImages: insertedImages || [] },
        ...prev,
      ]);
    } else {
      setLooks((prev) => [{ ...data, sourceImages: [] }, ...prev]);
    }

    toast({ title: "Duplicated", description: `"${data.name}" has been created.` });
  };

  const handleUploadImage = async (lookId: string, view: string, file: File) => {
    const look = looks.find((l) => l.id === lookId);
    if (!look) return;

    const uploadKey = `${lookId}-${view}`;
    setUploadingViews((prev) => ({ ...prev, [uploadKey]: true }));

    try {
      const fileName = `${lookId}/${view}-${Date.now()}.${file.name.split(".").pop()}`;
      const { error: uploadError } = await supabase.storage
        .from("images")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("images").getPublicUrl(fileName);
      const existingImage = look.sourceImages.find((img) => img.view === view);

      if (existingImage) {
        // Update both source_url and original_source_url (re-upload = new original)
        await supabase
          .from("look_source_images")
          .update({ source_url: urlData.publicUrl, original_source_url: urlData.publicUrl })
          .eq("id", existingImage.id);

        setLooks((prev) =>
          prev.map((l) =>
            l.id === lookId
              ? {
                  ...l,
                  sourceImages: l.sourceImages.map((img) =>
                    img.id === existingImage.id
                      ? { ...img, source_url: urlData.publicUrl }
                      : img
                  ),
                }
              : l
          )
        );
      } else {
        const { data: newImage } = await supabase
          .from("look_source_images")
          .insert({
            look_id: lookId,
            view,
            source_url: urlData.publicUrl,
            original_source_url: urlData.publicUrl,
            digital_talent_id: look.digital_talent_id,
          })
          .select()
          .single();

        if (newImage) {
          setLooks((prev) =>
            prev.map((l) =>
              l.id === lookId
                ? { ...l, sourceImages: [...l.sourceImages, newImage] }
                : l
            )
          );
        }
      }

      toast({ title: "Uploaded", description: `${view} image uploaded.` });
    } catch (error: any) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    } finally {
      setUploadingViews((prev) => ({ ...prev, [uploadKey]: false }));
    }
  };

  const handleRemoveImage = async (lookId: string, imageId: string) => {
    const { error } = await supabase.from("look_source_images").delete().eq("id", imageId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    setLooks((prev) =>
      prev.map((look) =>
        look.id === lookId
          ? { ...look, sourceImages: look.sourceImages.filter((img) => img.id !== imageId) }
          : look
      )
    );
  };

  const handleBulkUpload = async (files: File[]) => {
    if (files.length === 0) return;

    // Check if any files are TIFFs - if so, use TIFF import dialog
    const hasTiffs = files.some(isTiffFile);
    if (hasTiffs) {
      setTiffImportFiles(files);
      setShowTiffImport(true);
      return;
    }

    // Legacy flow for non-TIFF files
    const viewPatterns = /(front|back|side|detail)/i;
    const groups: Record<string, { view: string; file: File }[]> = {};

    files.forEach((file) => {
      const baseName = file.name.replace(/\.[^.]+$/, "");
      const viewMatch = baseName.match(viewPatterns);
      const view = viewMatch ? viewMatch[1].toLowerCase() : "front";
      let lookName = baseName
        .replace(viewPatterns, "")
        .replace(/[-_]+$/, "")
        .replace(/^[-_]+/, "")
        .trim();
      if (!lookName) lookName = `Look ${Object.keys(groups).length + 1}`;
      if (!groups[lookName]) groups[lookName] = [];
      groups[lookName].push({ view, file });
    });

    const lookNames = Object.keys(groups);
    setBulkUploadState({ isUploading: true, progress: { current: 0, total: files.length } });

    const talentId = await getDefaultTalentId();
    if (!talentId) {
      toast({ title: "Error", description: "No talent found", variant: "destructive" });
      setBulkUploadState({ isUploading: false, progress: { current: 0, total: 0 } });
      return;
    }

    let processedCount = 0;
    for (const lookName of lookNames) {
      const { data: lookData, error: lookError } = await supabase
        .from("talent_looks")
        .insert({ name: lookName, talent_id: talentId, project_id: projectId, digital_talent_id: null })
        .select()
        .single();
      if (lookError) continue;

      const newLook: LookData = { ...lookData, sourceImages: [] };
      for (const { view, file } of groups[lookName]) {
        try {
          const fileName = `${lookData.id}/${view}-${Date.now()}.${file.name.split(".").pop()}`;
          await supabase.storage.from("images").upload(fileName, file);
          const { data: urlData } = supabase.storage.from("images").getPublicUrl(fileName);
          const { data: imageData } = await supabase
            .from("look_source_images")
            .insert({ look_id: lookData.id, view, source_url: urlData.publicUrl, original_source_url: urlData.publicUrl })
            .select()
            .single();
          if (imageData) newLook.sourceImages.push(imageData);
        } catch (err) {
          console.error("Error uploading image:", err);
        }
        processedCount++;
        setBulkUploadState((prev) => ({ ...prev, progress: { ...prev.progress, current: processedCount } }));
      }
      setLooks((prev) => [newLook, ...prev]);
    }

    setBulkUploadState({ isUploading: false, progress: { current: 0, total: 0 } });
    toast({ title: "Bulk upload complete", description: `Created ${lookNames.length} looks from ${files.length} images.` });
  };

  // Track looks created during progressive import (lookKey -> lookId mapping)
  const progressiveLooksRef = useRef<Map<string, string>>(new Map());
  // Track in-flight look creation promises to prevent concurrent duplicate creation
  const lookCreationPromisesRef = useRef<Map<string, Promise<string | null>>>(new Map());

  // Helper to get or create a look, ensuring only one is created per lookKey
  const getOrCreateLook = useCallback(async (lookKey: string): Promise<string | null> => {
    const lookName = lookKey;
    const lookKeyUpper = lookKey.toUpperCase();
    
    // Check if we already have this look cached
    const cachedId = progressiveLooksRef.current.get(lookName);
    if (cachedId) return cachedId;
    
    // Check if there's already a creation in progress for this lookKey
    const existingPromise = lookCreationPromisesRef.current.get(lookName);
    if (existingPromise) {
      return existingPromise;
    }
    
    // Create a new promise for this lookKey creation
    const creationPromise = (async (): Promise<string | null> => {
      // Double-check cache after acquiring "lock"
      const recheckedId = progressiveLooksRef.current.get(lookName);
      if (recheckedId) return recheckedId;
      
      // Check if the look already exists in DB - fetch all looks and check by code extraction
      const { data: existingLooks } = await supabase
        .from("talent_looks")
        .select("id, name, look_code")
        .eq("project_id", projectId);
      
      // Find a match by look_code or by extracting code from name
      const matchingLook = existingLooks?.find(look => {
        // Direct match on look_code
        if (look.look_code?.toUpperCase() === lookKeyUpper) return true;
        // Extract code from name and compare
        const extractedCode = extractLookKey(look.name);
        return extractedCode?.toUpperCase() === lookKeyUpper;
      });
      
      if (matchingLook) {
        progressiveLooksRef.current.set(lookName, matchingLook.id);
        return matchingLook.id;
      }
      
      // Create a new look with look_code
      const talentId = await getDefaultTalentId();
      if (!talentId) {
        console.error("[TiffImport] No talent found for progressive save");
        return null;
      }
      
      const { data: lookData, error } = await supabase
        .from("talent_looks")
        .insert({ 
          name: lookName, 
          talent_id: talentId, 
          project_id: projectId, 
          digital_talent_id: null,
          look_code: lookKey,
        })
        .select()
        .single();
      
      if (error || !lookData) {
        console.error("[TiffImport] Failed to create look:", error);
        return null;
      }
      
      progressiveLooksRef.current.set(lookName, lookData.id);
      
      // Add to local state immediately
      const newLook: LookData = { ...lookData, sourceImages: [] };
      setLooks((prev) => [newLook, ...prev]);
      
      return lookData.id;
    })();
    
    // Store the promise so concurrent calls wait on it
    lookCreationPromisesRef.current.set(lookName, creationPromise);
    
    try {
      return await creationPromise;
    } finally {
      // Clean up the promise after it resolves
      lookCreationPromisesRef.current.delete(lookName);
    }
  }, [projectId]);

  // Progressive image save - called after each successful conversion
  const handleImageReady = useCallback(async (imageData: ProgressiveImageData): Promise<void> => {
    const { url, view, originalFilename, lookKey } = imageData;
    
    // Use lookKey or fallback to a generated name
    const lookName = lookKey || `Look_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const viewToUse = view === 'unassigned' ? 'front' : view;
    
    // Get or create the look (thread-safe)
    const lookId = await getOrCreateLook(lookName);
    if (!lookId) {
      console.error("[TiffImport] Could not get or create look for:", lookName);
      return;
    }
    
    // Insert the image with original_filename for traceability
    // Use upsert-like pattern: check DB directly to avoid stale state issues
    const { data: existingImages } = await supabase
      .from("look_source_images")
      .select("id")
      .eq("look_id", lookId)
      .eq("source_url", url)
      .limit(1);
    
    if (existingImages && existingImages.length > 0) {
      console.log("[TiffImport] Image already exists, skipping:", originalFilename);
      return;
    }
    
    const { data: imageResult, error: imageError } = await supabase
      .from("look_source_images")
      .insert({ 
        look_id: lookId, 
        view: viewToUse, 
        source_url: url, 
        original_source_url: url,
        original_filename: originalFilename,
      })
      .select()
      .single();
    
    if (imageError) {
      console.error("[TiffImport] Failed to insert image:", imageError);
      return;
    }
    
    // Update local state with the new image
    if (imageResult) {
      setLooks((prev) =>
        prev.map((look) =>
          look.id === lookId
            ? { ...look, sourceImages: [...look.sourceImages, imageResult] }
            : look
        )
      );
    }
  }, [getOrCreateLook]);

  const handleTiffImportComplete = async (createdLooks: { lookName: string; images: { url: string; view: string; originalFilename: string }[] }[]) => {
    // Clear the progressive looks caches when import completes
    progressiveLooksRef.current.clear();
    lookCreationPromisesRef.current.clear();
    
    // For any looks not already saved progressively, save them now
    const talentId = await getDefaultTalentId();
    if (!talentId) return;

    for (const { lookName, images } of createdLooks) {
      // Check if look was already created during progressive save
      const existingLook = looks.find(l => l.name === lookName);
      
      if (existingLook) {
        // Add only images that weren't already saved
        for (const { url, view } of images) {
          const imageExists = existingLook.sourceImages.some(img => img.source_url === url);
          if (!imageExists) {
            const viewToUse = view === 'unassigned' ? 'front' : view;
            const { data: imageData } = await supabase
              .from("look_source_images")
              .insert({ look_id: existingLook.id, view: viewToUse, source_url: url, original_source_url: url })
              .select()
              .single();
            if (imageData) {
              setLooks((prev) =>
                prev.map((look) =>
                  look.id === existingLook.id
                    ? { ...look, sourceImages: [...look.sourceImages, imageData] }
                    : look
                )
              );
            }
          }
        }
      } else {
        // Create new look (shouldn't happen if progressive save worked)
        const { data: lookData, error } = await supabase
          .from("talent_looks")
          .insert({ name: lookName, talent_id: talentId, project_id: projectId, digital_talent_id: null })
          .select()
          .single();
        if (error || !lookData) continue;

        const newLook: LookData = { ...lookData, sourceImages: [] };
        for (const { url, view } of images) {
          const viewToUse = view === 'unassigned' ? 'front' : view;
          const { data: imageData } = await supabase
            .from("look_source_images")
            .insert({ look_id: lookData.id, view: viewToUse, source_url: url })
            .select()
            .single();
          if (imageData) newLook.sourceImages.push(imageData);
        }
        setLooks((prev) => [newLook, ...prev]);
      }
    }
  };

  const handleChangeImageView = async (imageId: string, newView: string) => {
    const { error } = await supabase
      .from("look_source_images")
      .update({ view: newView })
      .eq("id", imageId);

    if (!error) {
      setLooks((prev) =>
        prev.map((look) => ({
          ...look,
          sourceImages: look.sourceImages.map((img) =>
            img.id === imageId ? { ...img, view: newView } : img
          ),
        }))
      );
      toast({ title: "View updated" });
    } else {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  // Handler for bulk deleting duplicates
  const handleDeleteDuplicates = async (lookIdsToDelete: string[]) => {
    // Delete all looks in one batch
    const { error } = await supabase
      .from("talent_looks")
      .delete()
      .in("id", lookIdsToDelete);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    // Update local state
    setLooks((prev) => prev.filter((look) => !lookIdsToDelete.includes(look.id)));
    
    // Clear any selected looks that were deleted
    setSelectedLookIds((prev) => {
      const next = new Set(prev);
      for (const id of lookIdsToDelete) {
        next.delete(id);
      }
      return next;
    });

    toast({ 
      title: "Duplicates deleted", 
      description: `Removed ${lookIdsToDelete.length} duplicate look${lookIdsToDelete.length !== 1 ? "s" : ""}.` 
    });
  };

  const hasAnyLooksWithImages = looks.some((look) => look.sourceImages.length > 0);
  const completeLooksCount = looks.filter((look) => {
    const views = look.sourceImages.map((img) => img.view);
    return views.includes("front") && views.includes("back");
  }).length;

  const assignedTalentsCount = new Set(
    looks.filter((l) => l.digital_talent_id).map((l) => l.digital_talent_id)
  ).size;

  // Selection handlers
  const handleToggleSelection = (lookId: string) => {
    setSelectedLookIds(prev => {
      const next = new Set(prev);
      if (next.has(lookId)) {
        next.delete(lookId);
      } else {
        next.add(lookId);
      }
      return next;
    });
  };

  const handleSelectAll = (lookIds: string[]) => {
    // If all filtered looks are already selected, deselect them
    const allFilteredSelected = lookIds.every(id => selectedLookIds.has(id));
    if (allFilteredSelected && lookIds.length > 0) {
      const newSet = new Set(selectedLookIds);
      lookIds.forEach(id => newSet.delete(id));
      setSelectedLookIds(newSet);
    } else {
      // Add all filtered looks to selection
      setSelectedLookIds(new Set([...selectedLookIds, ...lookIds]));
    }
  };

  const handleSelectReady = (lookIds: string[]) => {
    // Add the ready looks from filtered list to selection
    setSelectedLookIds(new Set([...selectedLookIds, ...lookIds]));
  };

  const handleClearSelection = () => {
    setSelectedLookIds(new Set());
  };

  // Empty state
  if (!loading && looks.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-center py-16 gap-6">
          <div className="text-center space-y-2">
            <FolderOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold">No looks yet</h3>
            <p className="text-muted-foreground text-sm max-w-md">
              Drag outfit images here to create looks automatically, or create a look manually.
            </p>
          </div>

          <BulkUploadZone
            onFilesSelected={handleBulkUpload}
            isUploading={bulkUploadState.isUploading}
            uploadProgress={bulkUploadState.progress}
          />

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>or</span>
          </div>

          <Button variant="outline" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Look Manually
          </Button>
        </div>

        <CreateLookDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          name={newLookName}
          setName={setNewLookName}
          onCreate={handleCreateLook}
        />

        <TiffImportDialog
          open={showTiffImport}
          onOpenChange={handleTiffDialogClose}
          files={tiffImportFiles}
          projectId={projectId}
          onComplete={handleTiffImportComplete}
          onImageReady={handleImageReady}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {looks.length} look{looks.length !== 1 ? "s" : ""} · {assignedTalentsCount} model
            {assignedTalentsCount !== 1 ? "s" : ""} · {completeLooksCount} complete
          </span>
        </div>
        <div className="flex items-center gap-2">
          {duplicateCount > 0 && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowDeleteDuplicates(true)}
              className="text-amber-600 border-amber-300 hover:bg-amber-50 hover:text-amber-700"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Duplicates ({duplicateCount})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowRecovery(true)}>
            <FolderSearch className="h-4 w-4 mr-2" />
            Recover Lost Images
          </Button>
          <Button size="sm" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Look
          </Button>
        </div>
      </div>

      {/* Compact bulk upload */}
      <BulkUploadZone
        onFilesSelected={handleBulkUpload}
        isUploading={bulkUploadState.isUploading}
        uploadProgress={bulkUploadState.progress}
        compact
      />

      {/* Looks table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <LooksTable
          looks={looks}
          talents={talents}
          selectedIds={selectedLookIds}
          onToggleSelection={handleToggleSelection}
          onSelectAll={handleSelectAll}
          onSelectReady={handleSelectReady}
          onClearSelection={handleClearSelection}
          onUpdateLook={handleUpdateLook}
          onDeleteLook={handleDeleteLook}
          onDuplicateLook={handleDuplicateLook}
          onUploadImage={handleUploadImage}
          onRemoveImage={handleRemoveImage}
          onChangeImageView={handleChangeImageView}
          uploadingViews={uploadingViews}
        />
      )}

      {/* Continue button */}
      <div className="flex justify-end pt-4">
        <Button 
          size="lg" 
          disabled={selectedLookIds.size === 0} 
          onClick={onContinue}
        >
          Continue with {selectedLookIds.size} Look{selectedLookIds.size !== 1 ? 's' : ''}
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>

      <CreateLookDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        name={newLookName}
        setName={setNewLookName}
        onCreate={handleCreateLook}
      />

      <TiffImportDialog
        open={showTiffImport}
        onOpenChange={handleTiffDialogClose}
        files={tiffImportFiles}
        projectId={projectId}
        onComplete={handleTiffImportComplete}
        onImageReady={handleImageReady}
      />

      <OrphanImageRecovery
        projectId={projectId}
        existingLookNames={looks.map((l) => l.name)}
        onRecovered={fetchLooks}
        open={showRecovery}
        onOpenChange={setShowRecovery}
      />

      <DeleteDuplicatesDialog
        open={showDeleteDuplicates}
        onOpenChange={setShowDeleteDuplicates}
        looks={looks}
        onDeleteDuplicates={handleDeleteDuplicates}
      />
    </div>
  );
}

function CreateLookDialog({
  open,
  onOpenChange,
  name,
  setName,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  setName: (name: string) => void;
  onCreate: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Look</DialogTitle>
          <DialogDescription>
            Enter a name for the new look. You can upload images after creating it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="look-name">Look Name</Label>
            <Input
              id="look-name"
              placeholder="e.g., Summer Dress 01"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) onCreate();
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onCreate} disabled={!name.trim()}>
            Create Look
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
