import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Search, User, Plus } from 'lucide-react';
import { Identity } from './types';
import { getImageUrl } from '@/lib/imageUtils';

interface MoveToModelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  identities: Identity[];
  excludeIdentityIds: string[];
  onSelect: (identityId: string) => void;
  onCreateNew: () => void;
  selectedCount: number;
}

export function MoveToModelDialog({
  open,
  onOpenChange,
  identities,
  excludeIdentityIds,
  onSelect,
  onCreateNew,
  selectedCount,
}: MoveToModelDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredIdentities = useMemo(() => {
    const available = identities.filter(i => !excludeIdentityIds.includes(i.id));
    if (!searchQuery.trim()) return available;
    const query = searchQuery.toLowerCase();
    return available.filter(
      i =>
        i.name.toLowerCase().includes(query) ||
        i.digital_talent?.name.toLowerCase().includes(query)
    );
  }, [identities, excludeIdentityIds, searchQuery]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move to Model</DialogTitle>
          <DialogDescription>
            Select a model to move {selectedCount} image{selectedCount > 1 ? 's' : ''} to.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search models..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Create New Option */}
          <Button
            variant="outline"
            className="w-full justify-start gap-3"
            onClick={onCreateNew}
          >
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Plus className="h-4 w-4 text-primary" />
            </div>
            <span>Create New Model</span>
          </Button>

          {/* Model List */}
          <ScrollArea className="h-[300px]">
            <div className="space-y-1">
              {filteredIdentities.map(identity => (
                <button
                  key={identity.id}
                  onClick={() => onSelect(identity.id)}
                  className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-muted transition-colors text-left"
                >
                  <Avatar className="h-8 w-8">
                    {identity.representative_image_url ? (
                      <AvatarImage
                        src={getImageUrl(identity.representative_image_url, 'tiny')}
                        alt={identity.name}
                        className="object-cover"
                      />
                    ) : null}
                    <AvatarFallback>
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm truncate block">
                      {identity.name}
                    </span>
                    {identity.digital_talent && (
                      <span className="text-xs text-muted-foreground truncate block">
                        {identity.digital_talent.name}
                      </span>
                    )}
                  </div>

                  <Badge variant="secondary" className="text-xs">
                    {identity.image_count}
                  </Badge>
                </button>
              ))}

              {filteredIdentities.length === 0 && (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  No models available
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
