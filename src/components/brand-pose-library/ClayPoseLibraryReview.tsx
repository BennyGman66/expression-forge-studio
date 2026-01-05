import { useState, useCallback, useMemo } from "react";
import { useBrands, Brand } from "@/hooks/useBrands";
import { useBrandLibraries } from "@/hooks/useBrandLibraries";
import { useLibraryPoses, PoseFilters, LibraryPose, OutputShotType, CurationStatus } from "@/hooks/useLibraryPoses";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { BrandSelector } from "@/components/shared/BrandSelector";
import { LibraryHeader } from "./LibraryHeader";
import { FiltersPanel } from "./FiltersPanel";
import { PoseGrid } from "./PoseGrid";
import { PoseInspector } from "./PoseInspector";
import { BulkActionBar } from "./BulkActionBar";
import { CoveragePanel } from "./CoveragePanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Library } from "lucide-react";
import { toast } from "sonner";

export function ClayPoseLibraryReview() {
  // Brand selection
  const { brands, loading: brandsLoading } = useBrands();
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const selectedBrand = brands.find((b) => b.id === selectedBrandId) || null;

  // Library management
  const {
    libraries,
    activeLibrary,
    loading: librariesLoading,
    createLibrary,
    updateLibraryStatus,
    selectLibrary,
  } = useBrandLibraries(selectedBrandId);

  // Poses
  const {
    poses,
    loading: posesLoading,
    coverage,
    updatePoseStatus,
    movePosesToShotType,
    deletePoses,
    filterPoses,
  } = useLibraryPoses(activeLibrary?.id || null);

  // UI State
  const [filters, setFilters] = useState<PoseFilters>({
    shotType: "all",
    gender: "all",
    status: "all",
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inspectedPose, setInspectedPose] = useState<LibraryPose | null>(null);
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

  const filteredPoses = useMemo(() => filterPoses(filters), [filterPoses, filters]);
  const isLocked = activeLibrary?.status === "locked";
  const minPosesPerSlot = (activeLibrary?.config_json as any)?.min_poses_per_slot || 50;

  // Calculate pending and failed counts
  const pendingCount = poses.filter((p) => p.curation_status === "pending").length;
  const failedCount = poses.filter((p) => p.curation_status === "failed").length;

  // Selection handlers
  const handleSelectPose = useCallback((id: string, shiftKey: boolean) => {
    if (shiftKey && lastSelectedId) {
      // Range select
      const startIdx = filteredPoses.findIndex((p) => p.id === lastSelectedId);
      const endIdx = filteredPoses.findIndex((p) => p.id === id);
      if (startIdx !== -1 && endIdx !== -1) {
        const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        const rangeIds = filteredPoses.slice(from, to + 1).map((p) => p.id);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          rangeIds.forEach((rid) => next.add(rid));
          return next;
        });
      }
    } else {
      setSelectedIds(new Set([id]));
      setInspectedPose(filteredPoses.find((p) => p.id === id) || null);
    }
    setLastSelectedId(id);
  }, [filteredPoses, lastSelectedId]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setInspectedPose(null);
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelectedIds(new Set(filteredPoses.map((p) => p.id)));
  }, [filteredPoses]);

  // Bulk actions
  const handleBulkInclude = useCallback(() => {
    if (selectedIds.size === 0 || isLocked) return;
    updatePoseStatus(Array.from(selectedIds), "included");
  }, [selectedIds, isLocked, updatePoseStatus]);

  const handleBulkExclude = useCallback(() => {
    if (selectedIds.size === 0 || isLocked) return;
    updatePoseStatus(Array.from(selectedIds), "excluded");
  }, [selectedIds, isLocked, updatePoseStatus]);

  const handleBulkMove = useCallback((shotType: OutputShotType) => {
    if (selectedIds.size === 0 || isLocked) return;
    movePosesToShotType(Array.from(selectedIds), shotType);
  }, [selectedIds, isLocked, movePosesToShotType]);

  const handleBulkDelete = useCallback(() => {
    if (selectedIds.size === 0 || isLocked) return;
    deletePoses(Array.from(selectedIds));
    clearSelection();
  }, [selectedIds, isLocked, deletePoses, clearSelection]);

  // Quick actions
  const handleQuickInclude = useCallback((id: string) => {
    if (isLocked) return;
    updatePoseStatus([id], "included");
  }, [isLocked, updatePoseStatus]);

  const handleQuickExclude = useCallback((id: string) => {
    if (isLocked) return;
    updatePoseStatus([id], "excluded");
  }, [isLocked, updatePoseStatus]);

  // Inspector actions
  const handleInspectorUpdateStatus = useCallback((status: CurationStatus) => {
    if (!inspectedPose || isLocked) return;
    updatePoseStatus([inspectedPose.id], status);
    setInspectedPose((prev) => prev ? { ...prev, curation_status: status } : null);
  }, [inspectedPose, isLocked, updatePoseStatus]);

  const handleInspectorMoveShotType = useCallback((shotType: OutputShotType) => {
    if (!inspectedPose || isLocked) return;
    movePosesToShotType([inspectedPose.id], shotType);
    setInspectedPose((prev) => prev ? { ...prev, shotType } : null);
  }, [inspectedPose, isLocked, movePosesToShotType]);

  // Library actions
  const handleCreateVersion = useCallback(async () => {
    if (!selectedBrandId) return;
    await createLibrary(selectedBrandId);
  }, [selectedBrandId, createLibrary]);

  const handleSubmitForReview = useCallback(() => {
    if (!activeLibrary) return;
    updateLibraryStatus(activeLibrary.id, "review");
  }, [activeLibrary, updateLibraryStatus]);

  const handleLock = useCallback(() => {
    if (!activeLibrary) return;
    updateLibraryStatus(activeLibrary.id, "locked");
  }, [activeLibrary, updateLibraryStatus]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onInclude: handleBulkInclude,
    onExclude: handleBulkExclude,
    onMoveToSlotA: () => handleBulkMove("FRONT_FULL"),
    onMoveToSlotB: () => handleBulkMove("FRONT_CROPPED"),
    onMoveToSlotC: () => handleBulkMove("BACK_FULL"),
    onMoveToSlotD: () => handleBulkMove("DETAIL"),
    onClearSelection: clearSelection,
    onSelectAll: selectAllVisible,
    enabled: !isLocked && selectedIds.size > 0,
  });

  // Loading state
  if (brandsLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Skeleton className="w-64 h-10" />
      </div>
    );
  }

  // No brand selected
  if (!selectedBrandId) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <Library className="w-12 h-12 text-muted-foreground" />
        <h3 className="text-lg font-medium">Select a Brand</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Choose a brand to view or create a pose library
        </p>
        <BrandSelector
          value=""
          onValueChange={setSelectedBrandId}
          placeholder="Select brand..."
        />
      </div>
    );
  }

  // No library exists for brand
  if (!librariesLoading && libraries.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <Library className="w-12 h-12 text-muted-foreground" />
        <h3 className="text-lg font-medium">No Library Found</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Create a new pose library for {selectedBrand?.name}
        </p>
        <Button onClick={handleCreateVersion}>
          <Plus className="w-4 h-4 mr-2" />
          Create Library v1
        </Button>
        <Button variant="ghost" onClick={() => setSelectedBrandId(null)}>
          Change Brand
        </Button>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-200px)] flex flex-col bg-background">
      {/* Header */}
      <LibraryHeader
        brandName={selectedBrand?.name || ""}
        libraries={libraries}
        activeLibrary={activeLibrary}
        onSelectLibrary={selectLibrary}
        onCreateVersion={handleCreateVersion}
        isLocked={isLocked}
      />

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left panel - Filters */}
        <div className="flex flex-col">
          <FiltersPanel
            filters={filters}
            onFiltersChange={setFilters}
            coverage={coverage}
            minPosesPerSlot={minPosesPerSlot}
            totalPoses={poses.length}
          />
          <div className="px-4 pb-4">
            <CoveragePanel
              coverage={coverage}
              minPosesPerSlot={minPosesPerSlot}
              libraryStatus={activeLibrary?.status || "draft"}
              onSubmitForReview={handleSubmitForReview}
              onLock={handleLock}
              pendingCount={pendingCount}
              failedCount={failedCount}
            />
          </div>
        </div>

        {/* Center - Grid */}
        {posesLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Skeleton className="w-64 h-64" />
          </div>
        ) : (
          <PoseGrid
            poses={filteredPoses}
            selectedIds={selectedIds}
            onSelectPose={handleSelectPose}
            onToggleSelect={handleToggleSelect}
            onInspect={setInspectedPose}
            onQuickInclude={handleQuickInclude}
            onQuickExclude={handleQuickExclude}
            isLocked={isLocked}
          />
        )}

        {/* Right panel - Inspector */}
        <PoseInspector
          pose={inspectedPose}
          onClose={() => setInspectedPose(null)}
          onUpdateStatus={handleInspectorUpdateStatus}
          onMoveToShotType={handleInspectorMoveShotType}
          isLocked={isLocked}
        />

        {/* Bulk action bar */}
        <BulkActionBar
          selectedCount={selectedIds.size}
          onClearSelection={clearSelection}
          onBulkInclude={handleBulkInclude}
          onBulkExclude={handleBulkExclude}
          onBulkMove={handleBulkMove}
          onBulkDelete={handleBulkDelete}
          isLocked={isLocked}
        />
      </div>
    </div>
  );
}
