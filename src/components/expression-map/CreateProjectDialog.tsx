import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DEFAULT_MASTER_PROMPT } from "@/lib/constants";

interface CreateProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, masterPrompt: string) => void;
}

export function CreateProjectDialog({ isOpen, onClose, onCreate }: CreateProjectDialogProps) {
  const [name, setName] = useState("");
  const [masterPrompt, setMasterPrompt] = useState(DEFAULT_MASTER_PROMPT);

  const handleCreate = () => {
    if (name.trim()) {
      onCreate(name.trim(), masterPrompt);
      setName("");
      setMasterPrompt(DEFAULT_MASTER_PROMPT);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Create New Campaign</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Campaign Name</Label>
            <Input
              id="name"
              placeholder="My Expression Map Campaign"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prompt">Master Prompt Template</Label>
            <p className="text-xs text-muted-foreground">
              This will be the base for all generated prompts. Expression recipes will be appended.
            </p>
            <Textarea
              id="prompt"
              value={masterPrompt}
              onChange={(e) => setMasterPrompt(e.target.value)}
              rows={8}
              className="font-mono text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim()}>
            Create Campaign
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
