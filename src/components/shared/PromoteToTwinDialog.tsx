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
import { usePromoteToTwin } from "@/hooks/usePromoteToTwin";
import { useBrands } from "@/hooks/useBrands";
import { Loader2, UserPlus } from "lucide-react";

interface PromoteToTwinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  identityId: string;
  defaultName: string;
  defaultGender: string | null;
  representativeImageUrl?: string | null;
  onSuccess?: (twinId: string, twinName: string) => void;
}

export function PromoteToTwinDialog({
  open,
  onOpenChange,
  identityId,
  defaultName,
  defaultGender,
  representativeImageUrl,
  onSuccess,
}: PromoteToTwinDialogProps) {
  const [name, setName] = useState(defaultName);
  const [gender, setGender] = useState<string>(defaultGender || "");
  const [brandId, setBrandId] = useState<string>("");
  
  const { promoteIdentityToTwin, isPromoting } = usePromoteToTwin();
  const { brands, loading: brandsLoading } = useBrands();

  useEffect(() => {
    if (open) {
      setName(defaultName);
      setGender(defaultGender || "");
      setBrandId("");
    }
  }, [open, defaultName, defaultGender]);

  const handleSubmit = async () => {
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
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Promote to Digital Twin
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
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
                <SelectItem value="women">Women</SelectItem>
                <SelectItem value="men">Men</SelectItem>
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name || isPromoting}>
            {isPromoting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Digital Twin
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
