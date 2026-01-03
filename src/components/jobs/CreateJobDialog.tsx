import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateJob } from "@/hooks/useJobs";
import { useFreelancers } from "@/hooks/useUsers";
import { JobType } from "@/types/jobs";

interface CreateJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType?: JobType;
  defaultLookId?: string;
  defaultProjectId?: string;
}

export function CreateJobDialog({
  open,
  onOpenChange,
  defaultType = "PHOTOSHOP_FACE_APPLY",
  defaultLookId,
  defaultProjectId,
}: CreateJobDialogProps) {
  const [type, setType] = useState<JobType>(defaultType);
  const [instructions, setInstructions] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>("");

  const createJob = useCreateJob();
  const { data: freelancers } = useFreelancers();

  const handleSubmit = () => {
    createJob.mutate(
      {
        type,
        instructions: instructions || undefined,
        due_date: dueDate || undefined,
        assigned_user_id: assigneeId || undefined,
        look_id: defaultLookId,
        project_id: defaultProjectId,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setInstructions("");
          setDueDate("");
          setAssigneeId("");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Job</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Job Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as JobType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PHOTOSHOP_FACE_APPLY">
                  Photoshop Face Apply
                </SelectItem>
                <SelectItem value="RETOUCH_FINAL">Final Retouch</SelectItem>
                <SelectItem value="FOUNDATION_FACE_REPLACE">Foundation Face Replace</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Instructions</Label>
            <Textarea
              placeholder="Enter instructions for the freelancer..."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label>Due Date (optional)</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Assign To (optional)</Label>
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select freelancer..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Unassigned</SelectItem>
                {freelancers?.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.display_name || f.email}
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
          <Button onClick={handleSubmit} disabled={createJob.isPending}>
            {createJob.isPending ? "Creating..." : "Create Job"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
