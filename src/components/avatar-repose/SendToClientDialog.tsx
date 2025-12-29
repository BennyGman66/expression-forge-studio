import { useState, useEffect } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Copy, ExternalLink, Plus } from "lucide-react";

interface SelectedImage {
  generationId: string;
  slot: string;
  lookId: string | null;
}

interface ExternalProject {
  id: string;
  name: string;
  client_id: string;
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
  const [projects, setProjects] = useState<ExternalProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  useEffect(() => {
    if (open) {
      fetchProjects();
    }
  }, [open]);

  const fetchProjects = async () => {
    const { data, error } = await supabase
      .from("external_projects")
      .select("id, name, client_id")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setProjects(data);
      // Auto-select first project if available
      if (data.length > 0 && !selectedProjectId) {
        setSelectedProjectId(data[0].id);
      }
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;

    try {
      // Get or create a default client
      let clientId: string;
      const { data: existingClients } = await supabase
        .from("external_clients")
        .select("id")
        .limit(1);

      if (existingClients && existingClients.length > 0) {
        clientId = existingClients[0].id;
      } else {
        const { data: newClient, error: clientError } = await supabase
          .from("external_clients")
          .insert({ name: "Default Client" })
          .select()
          .single();

        if (clientError) throw clientError;
        clientId = newClient.id;
      }

      const { data: newProject, error } = await supabase
        .from("external_projects")
        .insert({
          name: newProjectName.trim(),
          client_id: clientId,
        })
        .select()
        .single();

      if (error) throw error;

      setProjects([newProject, ...projects]);
      setSelectedProjectId(newProject.id);
      setNewProjectName("");
      setIsCreatingProject(false);
      toast({
        title: "Project created",
        description: `"${newProject.name}" has been created`,
      });
    } catch (error) {
      console.error("Error creating project:", error);
      toast({
        title: "Error",
        description: "Failed to create project",
        variant: "destructive",
      });
    }
  };

  const handleCreate = async () => {
    if (!reviewName.trim()) {
      toast({
        title: "Review name required",
        description: "Please enter a name for this review",
        variant: "destructive",
      });
      return;
    }

    if (!selectedProjectId) {
      toast({
        title: "Project required",
        description: "Please select or create a project",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);
    try {
      // Create the review with project_id
      const { data: review, error: reviewError } = await supabase
        .from("client_reviews")
        .insert({
          name: reviewName.trim(),
          password_hash: null,
          status: "sent",
          project_id: selectedProjectId,
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
    setIsCreatingProject(false);
    setNewProjectName("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {createdReviewId ? "Review Created" : "Send to Talent Replacement"}
          </DialogTitle>
          <DialogDescription>
            {createdReviewId
              ? "Share this link with your client to collect feedback"
              : `Send ${selectedImages.length} selected image${selectedImages.length !== 1 ? "s" : ""} to External > Talent Replacement`}
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
            {/* Project Selection */}
            <div className="space-y-2">
              <Label>Project</Label>
              {isCreatingProject ? (
                <div className="flex gap-2">
                  <Input
                    placeholder="New project name"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateProject();
                      if (e.key === "Escape") setIsCreatingProject(false);
                    }}
                  />
                  <Button size="sm" onClick={handleCreateProject}>
                    Add
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsCreatingProject(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Select
                    value={selectedProjectId}
                    onValueChange={setSelectedProjectId}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select a project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => setIsCreatingProject(true)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* Review Name */}
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
                disabled={isSending || !reviewName.trim() || !selectedProjectId}
              >
                {isSending ? "Sending..." : "Send to Client"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}