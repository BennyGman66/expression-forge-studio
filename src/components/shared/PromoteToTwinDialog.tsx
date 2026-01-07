import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePromoteToTwin } from "@/hooks/usePromoteToTwin";
import { useBrands } from "@/hooks/useBrands";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, UserPlus, Link } from "lucide-react";

interface PromoteToTwinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  identityId: string;
  defaultName: string;
  defaultGender: string | null;
  representativeImageUrl?: string | null;
  onSuccess?: (twinId: string, twinName: string) => void;
}

interface ExistingTwin {
  id: string;
  name: string;
  gender: string | null;
  front_face_url: string | null;
}

// Normalize gender values to match database format
const normalizeGender = (gender: string | null): string | null => {
  if (!gender) return null;
  const g = gender.toLowerCase();
  if (g === 'men' || g === 'male' || g === 'm') return 'male';
  if (g === 'women' || g === 'female' || g === 'f') return 'female';
  return gender;
};

export function PromoteToTwinDialog({
  open,
  onOpenChange,
  identityId,
  defaultName,
  defaultGender,
  representativeImageUrl,
  onSuccess,
}: PromoteToTwinDialogProps) {
  const [mode, setMode] = useState<"create" | "link">("create");
  const [name, setName] = useState(defaultName);
  const [gender, setGender] = useState<string>(defaultGender || "");
  const [brandId, setBrandId] = useState<string>("");
  const [selectedTwinId, setSelectedTwinId] = useState<string>("");
  const [existingTwins, setExistingTwins] = useState<ExistingTwin[]>([]);
  const [loadingTwins, setLoadingTwins] = useState(false);
  
  const { promoteIdentityToTwin, linkIdentityToExistingTwin, isPromoting } = usePromoteToTwin();
  const { brands, loading: brandsLoading } = useBrands();

  useEffect(() => {
    if (open) {
      setMode("create");
      setName(defaultName);
      setGender(defaultGender || "");
      setBrandId("");
      setSelectedTwinId("");
    }
  }, [open, defaultName, defaultGender]);

  // Load existing twins when "link" mode is selected
  useEffect(() => {
    if (mode === "link" && open) {
      loadExistingTwins();
    }
  }, [mode, open]);

  const loadExistingTwins = async () => {
    setLoadingTwins(true);
    try {
      let query = supabase
        .from("digital_talents")
        .select("id, name, gender, front_face_url")
        .order("name");
      
      // Filter by normalized gender if available
      if (defaultGender) {
        const normalizedGender = normalizeGender(defaultGender);
        if (normalizedGender) {
          query = query.eq("gender", normalizedGender);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      setExistingTwins(data || []);
    } catch (error) {
      console.error("Error loading twins:", error);
    } finally {
      setLoadingTwins(false);
    }
  };

  const handleSubmit = async () => {
    if (mode === "create") {
      const twin = await promoteIdentityToTwin({
        identityId,
        name,
        gender: gender || null,
        brandId: brandId || null,
      });

      if (twin) {
        onOpenChange(false);
        onSuccess?.(twin.id, name);
      }
    } else {
      if (!selectedTwinId) return;
      
      const result = await linkIdentityToExistingTwin({
        identityId,
        twinId: selectedTwinId,
      });

      if (result) {
        onOpenChange(false);
        onSuccess?.(result.twinId, result.twinName);
      }
    }
  };

  const selectedTwin = existingTwins.find(t => t.id === selectedTwinId);
  const isValid = mode === "create" ? !!name : !!selectedTwinId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "create" ? (
              <>
                <UserPlus className="h-5 w-5" />
                Create Digital Twin
              </>
            ) : (
              <>
                <Link className="h-5 w-5" />
                Link to Existing Twin
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as "create" | "link")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="create">Create New</TabsTrigger>
            <TabsTrigger value="link">Link to Existing</TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="space-y-4 pt-4">
            {/* Preview Image */}
            {representativeImageUrl && (
              <div className="flex justify-center">
                <div className="w-24 h-24 rounded-lg overflow-hidden bg-muted">
                  <img
                    src={representativeImageUrl}
                    alt="Model preview"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            )}

            {/* Name Input */}
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter twin name"
              />
            </div>

            {/* Gender Select */}
            <div className="space-y-2">
              <Label htmlFor="gender">Gender</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger>
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Brand Select */}
            <div className="space-y-2">
              <Label htmlFor="brand">Brand</Label>
              <Select value={brandId} onValueChange={setBrandId}>
                <SelectTrigger>
                  <SelectValue placeholder={brandsLoading ? "Loading..." : "Select brand"} />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>
                      {brand.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          <TabsContent value="link" className="space-y-4 pt-4">
            {/* Current Model Preview */}
            {representativeImageUrl && (
              <div className="flex justify-center">
                <div className="w-20 h-20 rounded-lg overflow-hidden bg-muted">
                  <img
                    src={representativeImageUrl}
                    alt="Model preview"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            )}

            {/* Twin Select */}
            <div className="space-y-2">
              <Label>Select Digital Twin</Label>
              <Select value={selectedTwinId} onValueChange={setSelectedTwinId}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingTwins ? "Loading twins..." : "Select a twin"} />
                </SelectTrigger>
                <SelectContent>
                  {existingTwins.map((twin) => (
                    <SelectItem key={twin.id} value={twin.id}>
                      <div className="flex items-center gap-2">
                        {twin.front_face_url && (
                          <img
                            src={twin.front_face_url}
                            alt={twin.name}
                            className="w-6 h-6 rounded object-cover"
                          />
                        )}
                        <span>{twin.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Selected Twin Preview */}
            {selectedTwin && (
              <div className="p-3 rounded-lg bg-muted/50 flex items-center gap-3">
                {selectedTwin.front_face_url && (
                  <img
                    src={selectedTwin.front_face_url}
                    alt={selectedTwin.name}
                    className="w-16 h-16 rounded-lg object-cover"
                  />
                )}
                <div>
                  <p className="font-medium">{selectedTwin.name}</p>
                  <p className="text-sm text-muted-foreground capitalize">
                    {selectedTwin.gender}
                  </p>
                </div>
              </div>
            )}

            {existingTwins.length === 0 && !loadingTwins && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No existing twins found{defaultGender ? ` for ${defaultGender}` : ""}. 
                Create a new one instead.
              </p>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isPromoting}>
            {isPromoting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "create" ? "Create Digital Twin" : "Link to Twin"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
