import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ArrowRight, Split, Trash2, X, Merge } from 'lucide-react';

interface BulkActionBarProps {
  selectedCount: number;
  selectedIdentityCount: number;
  onMove: () => void;
  onSplit: () => void;
  onMerge: () => void;
  onDelete: () => void;
  onClear: () => void;
  isOperating?: boolean;
}

export function BulkActionBar({
  selectedCount,
  selectedIdentityCount,
  onMove,
  onSplit,
  onMerge,
  onDelete,
  onClear,
  isOperating,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-3 bg-card border rounded-xl shadow-2xl px-5 py-3">
        <Badge variant="secondary" className="text-sm font-medium">
          {selectedCount} image{selectedCount > 1 ? 's' : ''} selected
        </Badge>

        <Separator orientation="vertical" className="h-6" />

        {/* Move to Model */}
        <Button
          size="sm"
          variant="outline"
          onClick={onMove}
          disabled={isOperating}
          className="gap-1.5"
        >
          <ArrowRight className="h-4 w-4" />
          Move to Model
        </Button>

        {/* Split to New Model */}
        <Button
          size="sm"
          variant="outline"
          onClick={onSplit}
          disabled={isOperating}
          className="gap-1.5"
        >
          <Split className="h-4 w-4" />
          Split to New
        </Button>

        {/* Merge Models (only if multiple source identities) */}
        {selectedIdentityCount >= 2 && (
          <Button
            size="sm"
            variant="outline"
            onClick={onMerge}
            disabled={isOperating}
            className="gap-1.5"
          >
            <Merge className="h-4 w-4" />
            Merge Sources
          </Button>
        )}

        <Separator orientation="vertical" className="h-6" />

        {/* Delete */}
        <Button
          size="sm"
          variant="destructive"
          onClick={onDelete}
          disabled={isOperating}
          className="gap-1.5"
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>

        {/* Clear */}
        <Button
          size="sm"
          variant="ghost"
          onClick={onClear}
          disabled={isOperating}
        >
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>
      </div>
    </div>
  );
}
