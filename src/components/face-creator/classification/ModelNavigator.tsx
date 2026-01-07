import { useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Search, User, Users, HelpCircle, Trash2, X } from 'lucide-react';
import { Identity } from './types';
import { getImageUrl } from '@/lib/imageUtils';

interface ModelNavigatorProps {
  identities: Identity[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onModelClick: (identityId: string) => void;
  focusedModelId: string | null;
  unclassifiedCount: number;
  onUnclassifiedClick: () => void;
  showUnclassified: boolean;
  selectedModelIds: Set<string>;
  onToggleModelSelect: (identityId: string) => void;
  onSelectAllModels: () => void;
  onClearModelSelection: () => void;
  onDeleteSelectedModels: () => void;
}

export function ModelNavigator({
  identities,
  searchQuery,
  onSearchChange,
  onModelClick,
  focusedModelId,
  unclassifiedCount,
  onUnclassifiedClick,
  showUnclassified,
  selectedModelIds,
  onToggleModelSelect,
  onSelectAllModels,
  onClearModelSelection,
  onDeleteSelectedModels,
}: ModelNavigatorProps) {
  const filteredIdentities = useMemo(() => {
    if (!searchQuery.trim()) return identities;
    const query = searchQuery.toLowerCase();
    return identities.filter(
      i => i.name.toLowerCase().includes(query) ||
        i.digital_talent?.name.toLowerCase().includes(query)
    );
  }, [identities, searchQuery]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">Models</span>
            <Badge variant="secondary" className="text-xs">
              {identities.length}
            </Badge>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search models..."
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedModelIds.size > 0 && (
        <div className="p-2 border-b border-border bg-muted/50">
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="secondary">{selectedModelIds.size}</Badge>
            <Button size="sm" variant="ghost" className="h-6 px-2" onClick={onClearModelSelection}>
              <X className="h-3 w-3" />
            </Button>
            <Separator orientation="vertical" className="h-4" />
            <Button
              size="sm"
              variant="destructive"
              className="h-6 px-2"
              onClick={onDeleteSelectedModels}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Model List */}
      <ScrollArea className="flex-1">
        <div className="p-1">
          {/* Unclassified */}
          {unclassifiedCount > 0 && (
            <button
              onClick={onUnclassifiedClick}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left transition-colors ${
                showUnclassified
                  ? 'bg-amber-500/10 text-amber-600'
                  : 'hover:bg-muted/50'
              }`}
            >
              <Avatar className="h-7 w-7 flex-shrink-0">
                <AvatarFallback className="bg-amber-500/20 text-amber-600">
                  <HelpCircle className="h-3.5 w-3.5" />
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium truncate flex-1">Unclassified</span>
              <Badge variant="secondary" className="bg-amber-500/20 text-amber-600 text-xs">
                {unclassifiedCount}
              </Badge>
            </button>
          )}

          {unclassifiedCount > 0 && filteredIdentities.length > 0 && (
            <Separator className="my-1" />
          )}

          {/* Models */}
          {filteredIdentities.map(identity => (
            <button
              key={identity.id}
              onClick={() => onModelClick(identity.id)}
              onContextMenu={e => {
                e.preventDefault();
                onToggleModelSelect(identity.id);
              }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left transition-colors group ${
                focusedModelId === identity.id
                  ? 'bg-primary/10 text-primary'
                  : selectedModelIds.has(identity.id)
                  ? 'bg-muted'
                  : 'hover:bg-muted/50'
              }`}
            >
              <Avatar className="h-7 w-7 flex-shrink-0">
                {identity.representative_image_url ? (
                  <AvatarImage
                    src={getImageUrl(identity.representative_image_url, 'tiny')}
                    alt={identity.name}
                    className="object-cover"
                  />
                ) : null}
                <AvatarFallback>
                  <User className="h-3.5 w-3.5" />
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium truncate block">{identity.name}</span>
                {identity.digital_talent && (
                  <span className="text-[10px] text-muted-foreground truncate block">
                    {identity.digital_talent.name}
                  </span>
                )}
              </div>

              <Badge variant="secondary" className="text-xs flex-shrink-0">
                {identity.image_count}
              </Badge>
            </button>
          ))}

          {filteredIdentities.length === 0 && (
            <div className="p-4 text-center text-muted-foreground text-xs">
              {searchQuery ? 'No models match search' : 'No models found'}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Select All Footer */}
      {identities.length > 0 && (
        <div className="p-2 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-7 text-xs"
            onClick={selectedModelIds.size === identities.length ? onClearModelSelection : onSelectAllModels}
          >
            {selectedModelIds.size === identities.length ? 'Deselect All' : 'Select All'}
          </Button>
        </div>
      )}
    </div>
  );
}
