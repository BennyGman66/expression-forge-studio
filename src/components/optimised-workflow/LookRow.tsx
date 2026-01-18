import { MoreVertical, Trash2, RefreshCw, Eye } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StagePill } from './StagePill';
import { ViewsStatusIcons } from './ViewsStatusIcons';
import { WorkflowLookWithDetails } from '@/types/optimised-workflow';
import { useDeleteWorkflowLook } from '@/hooks/useWorkflowLooks';
import { formatDistanceToNow } from 'date-fns';

interface LookRowProps {
  look: WorkflowLookWithDetails;
  isSelected: boolean;
  onSelect: (selected: boolean) => void;
  projectId: string;
}

export function LookRow({ look, isSelected, onSelect, projectId }: LookRowProps) {
  const deleteLook = useDeleteWorkflowLook();

  const handleDelete = async () => {
    if (confirm(`Delete look "${look.look_code}" and all its images?`)) {
      await deleteLook.mutateAsync(look.id);
    }
  };

  return (
    <div 
      className={`flex items-center px-6 py-3 border-b hover:bg-muted/30 transition-colors ${
        isSelected ? 'bg-primary/5' : ''
      }`}
    >
      {/* Checkbox */}
      <div className="w-10 flex items-center">
        <Checkbox
          checked={isSelected}
          onCheckedChange={onSelect}
          aria-label={`Select ${look.look_code}`}
        />
      </div>

      {/* Look Code */}
      <div className="flex-1 min-w-[200px]">
        <div className="font-medium text-foreground">{look.look_code}</div>
        {look.name && look.name !== look.look_code && (
          <div className="text-sm text-muted-foreground truncate max-w-[180px]">
            {look.name}
          </div>
        )}
      </div>

      {/* Stage */}
      <div className="w-32">
        <StagePill stage={look.stage} />
      </div>

      {/* Views Status */}
      <div className="w-32">
        <ViewsStatusIcons images={look.images} stage={look.stage} />
      </div>

      {/* Digital Talent */}
      <div className="w-40">
        {look.digital_talent ? (
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              {look.digital_talent.thumbnail_url ? (
                <AvatarImage src={look.digital_talent.thumbnail_url} />
              ) : null}
              <AvatarFallback className="text-xs">
                {look.digital_talent.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm truncate max-w-[100px]">
              {look.digital_talent.name}
            </span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">Not assigned</span>
        )}
      </div>

      {/* Updated */}
      <div className="w-28 text-sm text-muted-foreground">
        {formatDistanceToNow(new Date(look.updated_at), { addSuffix: true })}
      </div>

      {/* Issues */}
      <div className="w-40">
        {look.issues.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {look.issues.slice(0, 2).map((issue, i) => (
              <Badge 
                key={i} 
                variant="outline" 
                className="text-xs border-amber-300 text-amber-600 bg-amber-50"
              >
                {issue}
              </Badge>
            ))}
            {look.issues.length > 2 && (
              <Badge variant="outline" className="text-xs">
                +{look.issues.length - 2}
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </div>

      {/* Actions */}
      <div className="w-10">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <Eye className="h-4 w-4 mr-2" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem>
              <RefreshCw className="h-4 w-4 mr-2" />
              Regenerate
            </DropdownMenuItem>
            <DropdownMenuItem 
              className="text-destructive"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
