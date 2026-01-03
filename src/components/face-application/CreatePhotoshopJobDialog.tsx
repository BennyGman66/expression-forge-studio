import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateJob } from '@/hooks/useJobs';
import { useFreelancers } from '@/hooks/useUsers';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Briefcase, Image, User } from 'lucide-react';

interface CreatePhotoshopJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  lookId: string;
  lookName: string;
  talentName: string;
  selectedOutputUrls: string[];
  faceFoundationUrls: string[];
}

export function CreatePhotoshopJobDialog({
  open,
  onOpenChange,
  projectId,
  lookId,
  lookName,
  talentName,
  selectedOutputUrls,
  faceFoundationUrls,
}: CreatePhotoshopJobDialogProps) {
  const navigate = useNavigate();
  const createJob = useCreateJob();
  const { data: freelancers = [] } = useFreelancers();
  
  const [instructions, setInstructions] = useState(
    `Look: ${lookName}\nTalent: ${talentName}\n\nPlease review and refine the face application outputs.`
  );
  const [dueDate, setDueDate] = useState('');
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      // Create the job
      const job = await createJob.mutateAsync({
        type: 'PHOTOSHOP_FACE_APPLY',
        instructions,
        due_date: dueDate || undefined,
        assigned_user_id: assigneeId || undefined,
        look_id: lookId,
        project_id: projectId,
      });

      // Create artifacts and job inputs for selected outputs
      for (const url of selectedOutputUrls) {
        const { data: artifact } = await supabase
          .from('unified_artifacts')
          .insert({
            type: 'LOOK_PREP' as const,
            file_url: url,
            preview_url: url,
            look_id: lookId,
            project_id: projectId,
          })
          .select()
          .single();

        if (artifact) {
          await supabase.from('job_inputs').insert({
            job_id: job.id,
            artifact_id: artifact.id,
            label: 'Generated Output',
          });
        }
      }

      // Create artifacts and job inputs for face foundations
      for (const url of faceFoundationUrls) {
        const { data: artifact } = await supabase
          .from('unified_artifacts')
          .insert({
            type: 'FACE_LIBRARY_REF' as const,
            file_url: url,
            preview_url: url,
          })
          .select()
          .single();

        if (artifact) {
          await supabase.from('job_inputs').insert({
            job_id: job.id,
            artifact_id: artifact.id,
            label: 'Face Foundation',
          });
        }
      }

      toast.success('Photoshop job created successfully!');
      onOpenChange(false);
      
      // Ask if user wants to go to Job Board
      if (window.confirm('Job created! Would you like to view it in the Job Board?')) {
        navigate('/jobs');
      }
    } catch (error) {
      console.error('Error creating job:', error);
      toast.error('Failed to create job');
    } finally {
      setIsCreating(false);
    }
  };

  const totalInputs = selectedOutputUrls.length + faceFoundationUrls.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Briefcase className="h-5 w-5" />
            Create Photoshop Job
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Summary */}
          <div className="p-3 rounded-lg bg-muted/50 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Image className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Inputs:</span>
              <span className="text-foreground">{totalInputs} files attached</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Look:</span>
              <span className="text-foreground">{lookName}</span>
            </div>
          </div>

          {/* Instructions */}
          <div className="space-y-2">
            <Label htmlFor="instructions">Instructions</Label>
            <Textarea
              id="instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="bg-background border-border min-h-[100px]"
              placeholder="Provide instructions for the freelancer..."
            />
          </div>

          {/* Due Date */}
          <div className="space-y-2">
            <Label htmlFor="due-date">Due Date (Optional)</Label>
            <Input
              id="due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="bg-background border-border"
            />
          </div>

          {/* Assign Freelancer */}
          <div className="space-y-2">
            <Label>Assign Freelancer (Optional)</Label>
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger className="bg-background border-border">
                <SelectValue placeholder="Select a freelancer..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Unassigned</SelectItem>
                {freelancers.map(user => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.display_name || user.email}
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
          <Button onClick={handleCreate} disabled={isCreating}>
            {isCreating ? 'Creating...' : 'Create Job'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
