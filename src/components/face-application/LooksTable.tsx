import { useState, useRef, useMemo, useCallback } from "react";
import { ChevronDown, ChevronRight, MoreHorizontal, Trash2, Copy, Image as ImageIcon, Check, AlertCircle, Search, X } from "lucide-react";
import { format } from "date-fns";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Table, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { LookRowExpanded } from "./LookRowExpanded";
import { getImageUrl } from "@/lib/imageUtils";
import { cn } from "@/lib/utils";
export interface LookData {
  id: string;
  name: string;
  product_type: string | null;
  digital_talent_id: string | null;
  created_at: string;
  look_code?: string | null;
  sourceImages: {
    id: string;
    view: string;
    source_url: string;
  }[];
}

export interface TalentOption {
  id: string;
  name: string;
  front_face_url: string | null;
}

interface LooksTableProps {
  looks: LookData[];
  talents: TalentOption[];
  selectedIds?: Set<string>;
  onToggleSelection?: (lookId: string) => void;
  onSelectAll?: () => void;
  onSelectReady?: () => void;
  onClearSelection?: () => void;
  onUpdateLook: (lookId: string, updates: Partial<LookData>) => void;
  onDeleteLook: (lookId: string) => void;
  onDuplicateLook: (lookId: string) => void;
  onUploadImage: (lookId: string, view: string, file: File) => Promise<void>;
  onRemoveImage: (lookId: string, imageId: string) => void;
  onChangeImageView?: (imageId: string, newView: string) => void;
  uploadingViews: Record<string, boolean>;
}

const VIEWS = ["front", "back", "side", "detail"] as const;
const ROW_HEIGHT = 56; // pixels
const EXPANDED_ROW_HEIGHT = 420; // approximate height for expanded row

/**
 * TinyThumbnail - Lightweight thumbnail without IntersectionObserver overhead
 * Uses native browser lazy loading for tiny images
 */
function TinyThumbnail({ url, isRequired }: { url?: string; isRequired: boolean }) {
  if (url) {
    const tinyUrl = getImageUrl(url, "tiny");
    return (
      <div className="w-10 h-10 rounded overflow-hidden bg-muted">
        <img
          src={tinyUrl}
          alt=""
          loading="lazy"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "w-10 h-10 rounded flex items-center justify-center",
        isRequired ? "bg-amber-500/10 border border-amber-500/30" : "bg-muted border border-transparent"
      )}
    >
      <ImageIcon className={cn("h-4 w-4", isRequired ? "text-amber-500" : "text-muted-foreground")} />
    </div>
  );
}

function getStatus(look: LookData): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  const views = look.sourceImages.map((img) => img.view);
  const hasFront = views.includes("front");
  const hasBack = views.includes("back");

  if (hasFront && hasBack) {
    return { label: "Complete", variant: "default" };
  }
  if (!hasFront && !hasBack) {
    return { label: "Missing Front & Back", variant: "destructive" };
  }
  if (!hasFront) {
    return { label: "Missing Front", variant: "destructive" };
  }
  return { label: "Missing Back", variant: "destructive" };
}

export function LooksTable({
  looks,
  talents,
  selectedIds,
  onToggleSelection,
  onSelectAll,
  onSelectReady,
  onClearSelection,
  onUpdateLook,
  onDeleteLook,
  onDuplicateLook,
  onUploadImage,
  onRemoveImage,
  onChangeImageView,
  uploadingViews,
}: LooksTableProps) {
  const [expandedLookId, setExpandedLookId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const parentRef = useRef<HTMLDivElement>(null);

  const toggleExpand = (lookId: string) => {
    setExpandedLookId((prev) => (prev === lookId ? null : lookId));
  };

  const getViewUrl = (look: LookData, view: string) => {
    return look.sourceImages.find((img) => img.view === view)?.source_url;
  };

  // Filter looks based on search query (supports comma-separated values)
  const filteredLooks = useMemo(() => {
    if (!searchQuery.trim()) return looks;
    
    const searchTerms = searchQuery
      .split(",")
      .map((term) => term.trim().toLowerCase())
      .filter((term) => term.length > 0);
    
    if (searchTerms.length === 0) return looks;
    
    // Filter and track which search term each look matched
    const matchedLooks = looks
      .map((look) => {
        const lookName = look.name.toLowerCase();
        const lookCode = (look.look_code || "").toLowerCase();
        
        // Find the first matching search term's index
        const matchIndex = searchTerms.findIndex(
          (term) => lookName.includes(term) || lookCode.includes(term)
        );
        
        return { look, matchIndex };
      })
      .filter(({ matchIndex }) => matchIndex !== -1);
    
    // Sort by the order of search terms (maintains relative order for same term)
    matchedLooks.sort((a, b) => a.matchIndex - b.matchIndex);
    
    return matchedLooks.map(({ look }) => look);
  }, [looks, searchQuery]);

  const hasSelection = selectedIds !== undefined && onToggleSelection !== undefined;
  const allSelected = hasSelection && filteredLooks.length > 0 && selectedIds.size === filteredLooks.length;
  const someSelected = hasSelection && selectedIds.size > 0 && selectedIds.size < filteredLooks.length;
  const isFiltered = searchQuery.trim().length > 0;

  // Build flat list with expansion rows - key is used by virtualizer to track items
  const flatRows = useMemo(() => {
    const rows: { type: 'look' | 'expanded'; look: LookData; key: string }[] = [];
    for (const look of filteredLooks) {
      rows.push({ type: 'look', look, key: look.id });
      if (expandedLookId === look.id) {
        rows.push({ type: 'expanded', look, key: `${look.id}-expanded` });
      }
    }
    return rows;
  }, [filteredLooks, expandedLookId]);

  // Memoize virtualizer config functions to prevent re-initialization
  const estimateSize = useCallback((index: number) => {
    const row = flatRows[index];
    return row?.type === 'expanded' ? EXPANDED_ROW_HEIGHT : ROW_HEIGHT;
  }, [flatRows]);

  const getItemKey = useCallback((index: number) => {
    return flatRows[index]?.key ?? `row-${index}`;
  }, [flatRows]);

  const rowVirtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    getItemKey,
    overscan: 5,
  });

  return (
    <div className="space-y-2">
      {/* Search and Selection controls */}
      <div className="flex items-center gap-3">
        {/* Search input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by SKU or look name (comma-separated)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-8 h-8 text-sm"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
              onClick={() => setSearchQuery("")}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        
        {/* Filter count badge */}
        {isFiltered && (
          <Badge variant="secondary" className="text-xs">
            Showing {filteredLooks.length} of {looks.length}
          </Badge>
        )}

        {/* Selection controls */}
        {hasSelection && (
          <div className="flex items-center gap-2 text-sm ml-auto">
            <Button variant="outline" size="sm" onClick={onSelectAll} className="h-7 text-xs">
              {allSelected ? 'Deselect All' : 'Select All'}
            </Button>
            <Button variant="outline" size="sm" onClick={onSelectReady} className="h-7 text-xs">
              Select Ready ({filteredLooks.filter(l => {
                const views = l.sourceImages.map(img => img.view);
                return views.includes('front') && views.includes('back');
              }).length})
            </Button>
            {selectedIds.size > 0 && (
              <Button variant="ghost" size="sm" onClick={onClearSelection} className="h-7 text-xs text-muted-foreground">
                Clear
              </Button>
            )}
            {selectedIds.size > 0 && (
              <span className="text-muted-foreground">{selectedIds.size} selected</span>
            )}
          </div>
        )}
      </div>

      <div className="border rounded-lg overflow-hidden">
        {/* Fixed Header */}
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {hasSelection && (
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={allSelected}
                    ref={(el) => {
                      if (el) {
                        (el as any).indeterminate = someSelected;
                      }
                    }}
                    onCheckedChange={() => onSelectAll?.()}
                  />
                </TableHead>
              )}
              <TableHead className="w-[40px]"></TableHead>
              <TableHead>Look Name</TableHead>
              <TableHead className="w-[60px] text-center">Front</TableHead>
              <TableHead className="w-[60px] text-center">Back</TableHead>
              <TableHead className="w-[60px] text-center">Side</TableHead>
              <TableHead className="w-[60px] text-center">Detail</TableHead>
              <TableHead className="w-[180px]">Model</TableHead>
              <TableHead className="w-[140px]">Status</TableHead>
              <TableHead className="w-[150px]">Date Added</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
        </Table>

        {/* Virtualized Body */}
        <div
          ref={parentRef}
          className="overflow-auto"
          style={{ maxHeight: 'calc(100vh - 300px)' }}
        >
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = flatRows[virtualRow.index];
              const look = row.look;
              const isExpanded = expandedLookId === look.id;
              const status = getStatus(look);

              if (row.type === 'expanded') {
                return (
                  <div
                    key={`${look.id}-expanded`}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                      zIndex: 10,
                    }}
                    className="bg-background border-b overflow-hidden"
                  >
                    <LookRowExpanded
                      look={look}
                      talents={talents}
                      onUpdateLook={onUpdateLook}
                      onUploadImage={onUploadImage}
                      onRemoveImage={onRemoveImage}
                      onChangeImageView={onChangeImageView}
                      uploadingViews={uploadingViews}
                    />
                  </div>
                );
              }

              return (
                <div
                  key={look.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                    zIndex: isExpanded ? 11 : 1,
                  }}
                  className={cn(
                    "flex items-center flex-nowrap overflow-hidden border-b cursor-pointer transition-colors hover:bg-muted/50 bg-background",
                    isExpanded && "bg-muted/30",
                    hasSelection && selectedIds.has(look.id) && "bg-primary/5"
                  )}
                  onClick={() => toggleExpand(look.id)}
                >
                  {/* Checkbox */}
                  {hasSelection && (
                    <div className="w-[40px] flex-shrink-0 px-3" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(look.id)}
                        onCheckedChange={() => onToggleSelection?.(look.id)}
                      />
                    </div>
                  )}

                  {/* Expand icon */}
                  <div className="w-[40px] flex-shrink-0 px-3">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>

                  {/* Look Name */}
                  <div className="flex-1 min-w-0 px-3 font-medium truncate">
                    {look.name}
                  </div>

                  {/* View Thumbnails */}
                  <div className="w-[60px] flex-shrink-0 px-3 flex justify-center">
                    <TinyThumbnail url={getViewUrl(look, "front")} isRequired />
                  </div>
                  <div className="w-[60px] flex-shrink-0 px-3 flex justify-center">
                    <TinyThumbnail url={getViewUrl(look, "back")} isRequired />
                  </div>
                  <div className="w-[60px] flex-shrink-0 px-3 flex justify-center">
                    <TinyThumbnail url={getViewUrl(look, "side")} isRequired={false} />
                  </div>
                  <div className="w-[60px] flex-shrink-0 px-3 flex justify-center">
                    <TinyThumbnail url={getViewUrl(look, "detail")} isRequired={false} />
                  </div>

                  {/* Model Select */}
                  <div className="w-[180px] flex-shrink-0 px-3" onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={look.digital_talent_id || "none"}
                      onValueChange={(value) =>
                        onUpdateLook(look.id, {
                          digital_talent_id: value === "none" ? null : value,
                        })
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unassigned</SelectItem>
                        {talents.map((talent) => (
                          <SelectItem key={talent.id} value={talent.id}>
                            {talent.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Status */}
                  <div className="w-[140px] flex-shrink-0 px-3">
                    <Badge variant={status.variant} className="text-xs">
                      {status.variant === "default" && <Check className="h-3 w-3 mr-1" />}
                      {status.variant === "destructive" && <AlertCircle className="h-3 w-3 mr-1" />}
                      {status.label}
                    </Badge>
                  </div>

                  {/* Date Added */}
                  <div className="w-[150px] flex-shrink-0 px-3 text-sm text-muted-foreground">
                    {look.created_at ? format(new Date(look.created_at), "MMM d, yyyy h:mm a") : "—"}
                  </div>

                  {/* Actions */}
                  <div className="w-[50px] flex-shrink-0 px-3" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onDuplicateLook(look.id)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => onDeleteLook(look.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
