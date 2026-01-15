import { useRef, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Check, ChevronRight, Circle, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";
import { LookWithImages, getLookPairingStatus } from "./types";
import { ScrollArea } from "@/components/ui/scroll-area";

interface LookNavigatorProps {
  looks: LookWithImages[];
  pairings: Map<string, string>;
  selectedLookId: string | null;
  onSelectLook: (lookId: string) => void;
  filterMode: 'needs_action' | 'all';
}

const ROW_HEIGHT = 56;

export function LookNavigator({
  looks,
  pairings,
  selectedLookId,
  onSelectLook,
  filterMode,
}: LookNavigatorProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Filter looks based on mode
  const displayLooks = useMemo(() => {
    if (filterMode === 'all') return looks;
    return looks.filter(look => {
      const status = getLookPairingStatus(look, pairings);
      return status.status !== 'complete';
    });
  }, [looks, pairings, filterMode]);

  const rowVirtualizer = useVirtualizer({
    count: displayLooks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback(() => ROW_HEIGHT, []),
    overscan: 5,
  });

  const getStatusIcon = (status: 'empty' | 'partial' | 'complete') => {
    switch (status) {
      case 'complete':
        return <Check className="h-4 w-4 text-emerald-500" />;
      case 'partial':
        return <CircleDot className="h-4 w-4 text-amber-500" />;
      default:
        return <Circle className="h-4 w-4 text-muted-foreground/40" />;
    }
  };

  const getStatusColor = (status: 'empty' | 'partial' | 'complete') => {
    switch (status) {
      case 'complete':
        return 'bg-emerald-500';
      case 'partial':
        return 'bg-amber-500';
      default:
        return 'bg-muted-foreground/20';
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b bg-muted/30">
        <h3 className="text-sm font-medium">All Looks</h3>
        <p className="text-xs text-muted-foreground">
          {displayLooks.length} {filterMode === 'needs_action' ? 'need pairing' : 'total'}
        </p>
      </div>

      <div ref={parentRef} className="flex-1 overflow-auto">
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const look = displayLooks[virtualRow.index];
            const status = getLookPairingStatus(look, pairings);
            const isSelected = selectedLookId === look.id;

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
                }}
              >
                <button
                  onClick={() => onSelectLook(look.id)}
                  className={cn(
                    "w-full h-full px-3 py-2 flex items-center gap-3 text-left transition-colors border-b",
                    isSelected
                      ? "bg-primary/10 border-l-2 border-l-primary"
                      : "hover:bg-muted/50",
                    status.status === 'complete' && !isSelected && "opacity-60"
                  )}
                >
                  {/* Status indicator */}
                  <div className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    getStatusColor(status.status)
                  )} />

                  {/* Look info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{look.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {status.paired}/{status.total} paired
                    </p>
                  </div>

                  {/* Status icon + chevron */}
                  <div className="flex items-center gap-1 shrink-0">
                    {getStatusIcon(status.status)}
                    <ChevronRight className={cn(
                      "h-4 w-4 text-muted-foreground/50 transition-transform",
                      isSelected && "rotate-90"
                    )} />
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {displayLooks.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-4 text-center">
          <div>
            <Check className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">All looks paired!</p>
          </div>
        </div>
      )}
    </div>
  );
}
