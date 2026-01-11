import { useState } from "react";
import { ChevronDown, ChevronRight, MoreHorizontal, Trash2, Copy, Image as ImageIcon, Check, AlertCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LookRowExpanded } from "./LookRowExpanded";
import { OptimizedImage } from "@/components/shared/OptimizedImage";
import { cn } from "@/lib/utils";
export interface LookData {
  id: string;
  name: string;
  product_type: string | null;
  digital_talent_id: string | null;
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
  onUpdateLook: (lookId: string, updates: Partial<LookData>) => void;
  onDeleteLook: (lookId: string) => void;
  onDuplicateLook: (lookId: string) => void;
  onUploadImage: (lookId: string, view: string, file: File) => Promise<void>;
  onRemoveImage: (lookId: string, imageId: string) => void;
  onChangeImageView?: (imageId: string, newView: string) => void;
  uploadingViews: Record<string, boolean>;
}

const VIEWS = ["front", "back", "side", "detail"] as const;

function ViewThumbnail({ url, isRequired }: { url?: string; isRequired: boolean }) {
  if (url) {
    return (
      <div className="w-10 h-10 rounded overflow-hidden bg-muted">
        <OptimizedImage 
          src={url} 
          tier="tiny" 
          containerClassName="w-full h-full"
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
  onUpdateLook,
  onDeleteLook,
  onDuplicateLook,
  onUploadImage,
  onRemoveImage,
  onChangeImageView,
  uploadingViews,
}: LooksTableProps) {
  const [expandedLookId, setExpandedLookId] = useState<string | null>(null);

  const toggleExpand = (lookId: string) => {
    setExpandedLookId((prev) => (prev === lookId ? null : lookId));
  };

  const getViewUrl = (look: LookData, view: string) => {
    return look.sourceImages.find((img) => img.view === view)?.source_url;
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-[40px]"></TableHead>
            <TableHead>Look Name</TableHead>
            <TableHead className="w-[60px] text-center">Front</TableHead>
            <TableHead className="w-[60px] text-center">Back</TableHead>
            <TableHead className="w-[60px] text-center">Side</TableHead>
            <TableHead className="w-[60px] text-center">Detail</TableHead>
            <TableHead className="w-[180px]">Model</TableHead>
            <TableHead className="w-[140px]">Status</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {looks.map((look) => {
            const isExpanded = expandedLookId === look.id;
            const status = getStatus(look);
            const talentName = talents.find((t) => t.id === look.digital_talent_id)?.name;

            return (
              <>
                <TableRow
                  key={look.id}
                  className={cn(
                    "cursor-pointer transition-colors",
                    isExpanded && "bg-muted/30"
                  )}
                  onClick={() => toggleExpand(look.id)}
                >
                  <TableCell className="py-2">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell className="py-2 font-medium">{look.name}</TableCell>
                  <TableCell className="py-2">
                    <ViewThumbnail url={getViewUrl(look, "front")} isRequired />
                  </TableCell>
                  <TableCell className="py-2">
                    <ViewThumbnail url={getViewUrl(look, "back")} isRequired />
                  </TableCell>
                  <TableCell className="py-2">
                    <ViewThumbnail url={getViewUrl(look, "side")} isRequired={false} />
                  </TableCell>
                  <TableCell className="py-2">
                    <ViewThumbnail url={getViewUrl(look, "detail")} isRequired={false} />
                  </TableCell>
                  <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
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
                  </TableCell>
                  <TableCell className="py-2">
                    <Badge variant={status.variant} className="text-xs">
                      {status.variant === "default" && <Check className="h-3 w-3 mr-1" />}
                      {status.variant === "destructive" && <AlertCircle className="h-3 w-3 mr-1" />}
                      {status.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
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
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow key={`${look.id}-expanded`}>
                    <TableCell colSpan={9} className="p-0 bg-muted/20">
                      <LookRowExpanded
                        look={look}
                        talents={talents}
                        onUpdateLook={onUpdateLook}
                        onUploadImage={onUploadImage}
                        onRemoveImage={onRemoveImage}
                        onChangeImageView={onChangeImageView}
                        uploadingViews={uploadingViews}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
