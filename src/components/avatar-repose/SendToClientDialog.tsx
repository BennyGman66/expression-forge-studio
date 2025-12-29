import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Copy, ExternalLink } from "lucide-react";

interface SelectedImage {
  generationId: string;
  slot: string;
  lookId: string | null;
}

interface SendToClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedImages: SelectedImage[];
  onSuccess?: () => void;
}

export function SendToClientDialog({
  open,
  onOpenChange,
  selectedImages,
  onSuccess,
}: SendToClientDialogProps) {
  const [reviewName, setReviewName] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [createdReviewId, setCreatedReviewId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!reviewName.trim()) {
      toast({
        title: "Review name required",
        description: "Please enter a name for this review",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);
    try {
      // Create the review without password
      const { data: review, error: reviewError } = await supabase
        .from("client_reviews")
        .insert({
          name: reviewName.trim(),
          password_hash: null,
          status: "draft",
        })
        .select()
        .single();

      if (reviewError) throw reviewError;

      // Create review items
      const reviewItems = selectedImages.map((img, index) => ({
        review_id: review.id,
        generation_id: img.generationId,
        slot: img.slot,
        look_id: img.lookId,
        position: index,
      }));

      const { error: itemsError } = await supabase
        .from("client_review_items")
        .insert(reviewItems);

      if (itemsError) throw itemsError;

      setCreatedReviewId(review.id);
      toast({
        title: "Review created",
        description: "Client review is ready to share",
      });

      onSuccess?.();
    } catch (error) {
      console.error("Error creating review:", error);
      toast({
        title: "Error",
        description: "Failed to create client review",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const reviewUrl = createdReviewId
    ? `${window.location.origin}/review/${createdReviewId}`
    : null;

  const copyLink = () => {
    if (reviewUrl) {
      navigator.clipboard.writeText(reviewUrl);
      toast({
        title: "Link copied",
        description: "Review link copied to clipboard",
      });
    }
  };

  const resetAndClose = () => {
    setReviewName("");
    setCreatedReviewId(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {createdReviewId ? "Review Created" : "Create Client Review"}
          </DialogTitle>
          <DialogDescription>
            {createdReviewId
              ? "Share this link with your client to collect feedback"
              : `Create a review with ${selectedImages.length} selected image${selectedImages.length !== 1 ? "s" : ""}`}
          </DialogDescription>
        </DialogHeader>

        {createdReviewId ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <Input
                readOnly
                value={reviewUrl || ""}
                className="bg-transparent border-none text-sm"
              />
              <Button size="sm" variant="ghost" onClick={copyLink}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => window.open(reviewUrl!, "_blank")}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={resetAndClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reviewName">Review Name</Label>
              <Input
                id="reviewName"
                placeholder="e.g., Spring 2025 - Round 1"
                value={reviewName}
                onChange={(e) => setReviewName(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={resetAndClose}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={isSending || !reviewName.trim()}
              >
                {isSending ? "Creating..." : "Create Review"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
