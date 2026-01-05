import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DigitalTwinWithBrand, DigitalTwinImage } from "@/types/digital-twin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Pencil, Trash2, Check, X, User, Image, Star, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { SavedPairingsSection } from "./SavedPairingsSection";
import { usePairingTemplates } from "@/hooks/usePairingTemplates";

interface TwinDetailPanelProps {
  twin: DigitalTwinWithBrand;
  onUpdate: () => void;
  onDelete: () => void;
}

export function TwinDetailPanel({ twin, onUpdate, onDelete }: TwinDetailPanelProps) {
  const [images, setImages] = useState<DigitalTwinImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(twin.name);
  const [pairingsOpen, setPairingsOpen] = useState(true);
  const { templates } = usePairingTemplates(twin.id);

  useEffect(() => {
    fetchImages();
  }, [twin.id]);

  useEffect(() => {
    setEditName(twin.name);
  }, [twin.name]);

  const fetchImages = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("digital_twin_images")
      .select("*")
      .eq("twin_id", twin.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching twin images:", error);
    } else {
      setImages((data || []).map((img: any) => ({
        ...img,
        crop_data: img.crop_data as DigitalTwinImage["crop_data"],
      })));
    }
    setLoading(false);
  };

  const handleSaveName = async () => {
    if (!editName.trim()) return;
    
    const { error } = await supabase
      .from("digital_twins")
      .update({ name: editName.trim() })
      .eq("id", twin.id);

    if (error) {
      toast.error("Failed to update name");
    } else {
      toast.success("Name updated");
      setIsEditing(false);
      onUpdate();
    }
  };

  const handleDelete = async () => {
    const { error } = await supabase
      .from("digital_twins")
      .delete()
      .eq("id", twin.id);

    if (error) {
      toast.error("Failed to delete twin");
    } else {
      toast.success("Digital Twin deleted");
      onDelete();
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b space-y-3">
        {/* Representative Image */}
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-lg overflow-hidden bg-muted">
            {twin.representative_image_url ? (
              <img
                src={twin.representative_image_url}
                alt={twin.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <User className="h-8 w-8 text-muted-foreground/50" />
              </div>
            )}
          </div>
        </div>

        {/* Name */}
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-8"
                autoFocus
              />
              <Button size="icon" variant="ghost" onClick={handleSaveName}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setIsEditing(false)}>
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <h2 className="font-semibold text-lg flex-1">{twin.name}</h2>
              <Button size="icon" variant="ghost" onClick={() => setIsEditing(true)}>
                <Pencil className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-2">
          {twin.gender && (
            <Badge variant="secondary" className="capitalize">
              {twin.gender}
            </Badge>
          )}
          {twin.brand && (
            <Badge variant="outline">{twin.brand.name}</Badge>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Image className="h-4 w-4" />
            {twin.image_count} images
          </span>
          {twin.usage_count > 0 && (
            <span>{twin.usage_count} uses</span>
          )}
        </div>
      </div>

      {/* Saved Pairings Section */}
      <div className="px-4 py-3 border-b">
        <Collapsible open={pairingsOpen} onOpenChange={setPairingsOpen}>
          <CollapsibleTrigger className="flex items-center justify-between w-full text-sm font-medium">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-500" />
              Saved Pairings
              {templates.length > 0 && (
                <Badge variant="secondary" className="text-xs">{templates.length}</Badge>
              )}
            </div>
            <ChevronDown className={`h-4 w-4 transition-transform ${pairingsOpen ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <SavedPairingsSection digitalTalentId={twin.id} />
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Images Grid */}
      <ScrollArea className="flex-1 p-4">
        <div className="grid grid-cols-3 gap-2">
          {images.map((image) => (
            <div
              key={image.id}
              className="aspect-square bg-muted rounded-md overflow-hidden relative group"
            >
              <img
                src={image.stored_url || image.source_url}
                alt="Twin image"
                className="w-full h-full object-cover"
              />
              {image.view !== "unknown" && (
                <Badge
                  variant="secondary"
                  className="absolute bottom-1 left-1 text-[10px] capitalize"
                >
                  {image.view}
                </Badge>
              )}
            </div>
          ))}
        </div>
        {loading && (
          <div className="text-center text-muted-foreground py-8">
            Loading images...
          </div>
        )}
        {!loading && images.length === 0 && (
          <div className="text-center text-muted-foreground py-8">
            No images available
          </div>
        )}
      </ScrollArea>

      {/* Footer Actions */}
      <div className="p-4 border-t">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" className="w-full">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Digital Twin
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Digital Twin?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete "{twin.name}" and all associated images.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
