import { useState, useEffect, useMemo, useCallback } from "react";
import { DndContext, DragEndEvent, DragStartEvent, DragOverEvent, pointerWithin } from "@dnd-kit/core";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Check, Filter, Loader2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import { LookNavigator } from "./LookNavigator";
import { LookPairingPanel } from "./LookPairingPanel";
import { FaceFoundationTray } from "./FaceFoundationTray";
import { LookWithImages, getLookPairingStatus } from "./types";
import { FaceFoundation } from "@/types/face-application";
import { useWorkflowStateContext } from "@/contexts/WorkflowStateContext";

interface FaceMatchLayoutProps {
  projectId: string;
  selectedLookIds?: Set<string>;
  onContinue: () => void;
}

export function FaceMatchLayout({ projectId, selectedLookIds, onContinue }: FaceMatchLayoutProps) {
  const [looks, setLooks] = useState<LookWithImages[]>([]);
  const [faceFoundations, setFaceFoundations] = useState<FaceFoundation[]>([]);
  const [pairings, setPairings] = useState<Map<string, string>>(new Map());
  const [selectedLookId, setSelectedLookId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dragOverSlotId, setDragOverSlotId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<'needs_action' | 'all'>('needs_action');
  const [clickSelectedFace, setClickSelectedFace] = useState<string | null>(null);
  
  const { toast } = useToast();
  const workflowState = useWorkflowStateContext();

  // Fetch looks with cropped source images
  useEffect(() => {
    if (!projectId) return;

    const fetchData = async () => {
      setIsLoading(true);
      
      // Get all looks for this project
      const { data: looksData } = await supabase
        .from("talent_looks")
        .select("id, name, digital_talent_id")
        .eq("project_id", projectId)
        .order("created_at");

      if (!looksData || looksData.length === 0) {
        setLooks([]);
        setIsLoading(false);
        return;
      }

      // Filter by selectedLookIds if provided
      const filteredLooksData = selectedLookIds && selectedLookIds.size > 0
        ? looksData.filter(l => selectedLookIds.has(l.id))
        : looksData;

      // Extract unique talent IDs
      const talentIds = [...new Set(filteredLooksData.map(l => l.digital_talent_id).filter(Boolean))] as string[];

      // Fetch source images for all looks
      // Fetch ALL source images (cropped or not) so we can show uncropped ones with "Crop Now" option
      const { data: allImages } = await supabase
        .from("look_source_images")
        .select("*")
        .in("look_id", filteredLooksData.map(l => l.id))
        .order("view");

      // Build looks with images
      const looksWithImages: LookWithImages[] = filteredLooksData
        .filter(look => look.digital_talent_id !== null)
        .map(look => ({
          id: look.id,
          name: look.name,
          digital_talent_id: look.digital_talent_id,
          sourceImages: (allImages || []).filter(img => img.look_id === look.id) as any,
        }))
        // Now include looks that have ANY source images (not just cropped ones)
        .filter(look => look.sourceImages.length > 0);

      setLooks(looksWithImages);

      // Fetch face foundations for all talents
      if (talentIds.length > 0) {
        const { data: foundationsData } = await supabase
          .from("face_pairing_outputs")
          .select(`
            id,
            stored_url,
            pairing:face_pairings!inner(
              digital_talent_id,
              cropped_face_id
            )
          `)
          .eq("status", "completed")
          .eq("is_face_foundation", true)
          .not("stored_url", "is", null);

        if (foundationsData) {
          const foundations: FaceFoundation[] = [];

          for (const output of foundationsData) {
            const pairing = output.pairing as any;
            if (pairing?.digital_talent_id && talentIds.includes(pairing.digital_talent_id) && output.stored_url) {
              const { data: identityImage } = await supabase
                .from("face_identity_images")
                .select("view")
                .eq("scrape_image_id", pairing.cropped_face_id)
                .maybeSingle();

              foundations.push({
                id: output.id,
                stored_url: output.stored_url,
                view: (identityImage?.view as any) || "unknown",
                digital_talent_id: pairing.digital_talent_id,
              });
            }
          }

          setFaceFoundations(foundations);
        }
      }

      // Select first look that needs action
      if (looksWithImages.length > 0) {
        setSelectedLookId(looksWithImages[0].id);
      }

      setIsLoading(false);
    };

    fetchData();
  }, [projectId, selectedLookIds]);

  // Calculate progress - now accounting for cropped vs uncropped
  const { totalViews, croppedViews, pairedViews, completedLooks, needsActionLooks } = useMemo(() => {
    let total = 0;
    let cropped = 0;
    let paired = 0;
    let completed = 0;
    let needsAction = 0;

    looks.forEach(look => {
      const status = getLookPairingStatus(look, pairings);
      total += status.total;
      cropped += status.cropped;
      paired += status.paired;
      if (status.status === 'complete') {
        completed++;
      } else {
        needsAction++;
      }
    });

    return { totalViews: total, croppedViews: cropped, pairedViews: paired, completedLooks: completed, needsActionLooks: needsAction };
  }, [looks, pairings]);

  const progressPercent = croppedViews > 0 ? Math.round((pairedViews / croppedViews) * 100) : 0;

  // Selected look
  const selectedLook = useMemo(() => 
    looks.find(l => l.id === selectedLookId) || null,
    [looks, selectedLookId]
  );

  // Handlers
  const handleSetPairing = useCallback((sourceImageId: string, faceUrl: string) => {
    setPairings(prev => {
      const next = new Map(prev);
      next.set(sourceImageId, faceUrl);
      return next;
    });
    setClickSelectedFace(null);
  }, []);

  const handleClearPairing = useCallback((sourceImageId: string) => {
    setPairings(prev => {
      const next = new Map(prev);
      next.delete(sourceImageId);
      return next;
    });
  }, []);

  const handleApplyAutoMatches = useCallback(() => {
    if (!selectedLook) return;
    
    const talentFoundations = faceFoundations.filter(
      f => f.digital_talent_id === selectedLook.digital_talent_id
    );

    setPairings(prev => {
      const next = new Map(prev);
      selectedLook.sourceImages.forEach(img => {
        // Only auto-match images that have been cropped AND don't already have a pairing
        if (img.head_cropped_url && !next.has(img.id)) {
          const matchingFace = talentFoundations.find(f => f.view === img.view);
          if (matchingFace) {
            next.set(img.id, matchingFace.stored_url);
          } else if (talentFoundations.length > 0) {
            next.set(img.id, talentFoundations[0].stored_url);
          }
        }
      });
      return next;
    });
  }, [selectedLook, faceFoundations]);

  const handleFaceClick = useCallback((faceUrl: string) => {
    if (clickSelectedFace === faceUrl) {
      setClickSelectedFace(null);
    } else {
      setClickSelectedFace(faceUrl);
    }
  }, [clickSelectedFace]);

  const handleSlotClickWhenFaceSelected = useCallback((sourceImageId: string) => {
    if (clickSelectedFace) {
      handleSetPairing(sourceImageId, clickSelectedFace);
    }
  }, [clickSelectedFace, handleSetPairing]);

  // Refresh function for after inline crop
  const handleCropComplete = useCallback((updatedImage: any) => {
    setLooks(prevLooks => 
      prevLooks.map(look => ({
        ...look,
        sourceImages: look.sourceImages.map(img =>
          img.id === updatedImage.id ? updatedImage : img
        ),
      }))
    );
  }, []);

  // Drag handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    setDragOverSlotId(event.over?.id as string || null);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);
    setDragOverSlotId(null);

    if (over && active.data.current?.faceUrl) {
      handleSetPairing(over.id as string, active.data.current.faceUrl);
    }
  }, [handleSetPairing]);

  // Save and continue
  const handleSaveAndContinue = async () => {
    setIsSaving(true);
    try {
      // Save face matches - update source images with talent IDs
      const updates = Array.from(pairings.entries()).map(([sourceImageId, faceUrl]) => {
        const foundation = faceFoundations.find(f => f.stored_url === faceUrl);
        return {
          id: sourceImageId,
          digital_talent_id: foundation?.digital_talent_id,
        };
      });

      for (const update of updates) {
        if (update.digital_talent_id) {
          await supabase
            .from("look_source_images")
            .update({ digital_talent_id: update.digital_talent_id })
            .eq("id", update.id);
        }

        // Update workflow state
        const sourceImage = looks.flatMap(l => l.sourceImages).find(img => img.id === update.id);
        if (sourceImage) {
          try {
            await workflowState.updateViewState(sourceImage.look_id, sourceImage.view, 'match', 'completed');
          } catch (e) {
            console.error('Failed to update workflow state:', e);
          }
        }
      }

      toast({ title: "Pairings saved" });
      onContinue();
    } catch (error: any) {
      toast({ title: "Error saving pairings", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (looks.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-center">
        <div>
          <p className="text-muted-foreground">No looks with cropped images found.</p>
          <p className="text-sm text-muted-foreground mt-1">Complete head crops in the previous step first.</p>
        </div>
      </div>
    );
  }

  return (
    <DndContext
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-[calc(100vh-200px)]">
        {/* Top Bar */}
        <div className="px-4 py-3 border-b bg-background shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-xl font-semibold">Face Matching</h2>
              <p className="text-sm text-muted-foreground">
                Pair face foundations to all look images
              </p>
            </div>
            <Button
              onClick={handleSaveAndContinue}
              disabled={pairings.size === 0 || isSaving}
              className="gap-2"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              Save & Continue
            </Button>
          </div>

          {/* Progress bar and counters */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Progress value={progressPercent} className="h-2" />
            </div>
            <div className="flex items-center gap-4 text-sm shrink-0">
              <span className="text-muted-foreground">
                Total: <span className="font-medium text-foreground">{looks.length}</span>
              </span>
              <span className="text-emerald-600">
                Complete: <span className="font-medium">{completedLooks}</span>
              </span>
              <span className="text-amber-600">
                Needs Pairing: <span className="font-medium">{needsActionLooks}</span>
              </span>
            </div>
          </div>

          {/* Filter toggle */}
          <div className="flex gap-2 mt-3">
            <Button
              variant={filterMode === 'needs_action' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterMode('needs_action')}
              className="gap-1"
            >
              <Filter className="h-3 w-3" />
              Needs Pairing ({needsActionLooks})
            </Button>
            <Button
              variant={filterMode === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterMode('all')}
            >
              Show All ({looks.length})
            </Button>
          </div>
        </div>

        {/* 3-Column Layout */}
        <div className="flex-1 flex min-h-0">
          {/* Left: Look Navigator */}
          <div className="w-72 border-r bg-muted/20 flex flex-col shrink-0">
            <LookNavigator
              looks={looks}
              pairings={pairings}
              selectedLookId={selectedLookId}
              onSelectLook={setSelectedLookId}
              filterMode={filterMode}
            />
          </div>

          {/* Center: Pairing Panel */}
          <div className="flex-1 flex flex-col min-w-0 bg-background">
            <LookPairingPanel
              look={selectedLook}
              faceFoundations={faceFoundations}
              pairings={pairings}
              onSetPairing={handleSetPairing}
              onClearPairing={handleClearPairing}
              onApplyAutoMatches={handleApplyAutoMatches}
              onCropComplete={handleCropComplete}
              dragOverSlotId={dragOverSlotId}
            />
          </div>

          {/* Right: Face Foundation Tray */}
          <div className="w-56 border-l bg-muted/20 flex flex-col shrink-0">
            <FaceFoundationTray
              foundations={faceFoundations}
              selectedLook={selectedLook}
              onFaceClick={handleFaceClick}
              activeDragId={activeDragId}
            />
          </div>
        </div>
      </div>
    </DndContext>
  );
}
