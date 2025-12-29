import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Send, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ExternalClient {
  id: string;
  name: string;
}

interface ExternalProject {
  id: string;
  name: string;
  client_id: string;
}

interface SelectedImage {
  generationId: string;
  slot: string;
  lookId: string | null;
}

interface SendToClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedImages: SelectedImage[];
  onSuccess: () => void;
}

export function SendToClientDialog({
  open,
  onOpenChange,
  selectedImages,
  onSuccess,
}: SendToClientDialogProps) {
  const [clients, setClients] = useState<ExternalClient[]>([]);
  const [projects, setProjects] = useState<ExternalProject[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [newClientName, setNewClientName] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [reviewName, setReviewName] = useState('');
  const [password, setPassword] = useState('');
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchClients();
    }
  }, [open]);

  useEffect(() => {
    if (selectedClientId && selectedClientId !== 'new') {
      fetchProjects(selectedClientId);
    } else {
      setProjects([]);
      setSelectedProjectId('');
    }
  }, [selectedClientId]);

  const fetchClients = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('external_clients')
      .select('*')
      .order('name');

    if (error) {
      toast.error('Failed to load clients');
    } else {
      setClients(data || []);
    }
    setLoading(false);
  };

  const fetchProjects = async (clientId: string) => {
    const { data, error } = await supabase
      .from('external_projects')
      .select('*')
      .eq('client_id', clientId)
      .order('name');

    if (error) {
      toast.error('Failed to load projects');
    } else {
      setProjects(data || []);
    }
  };

  const handleCreateClient = async () => {
    if (!newClientName.trim()) return;

    setIsCreatingClient(true);
    const { data, error } = await supabase
      .from('external_clients')
      .insert({ name: newClientName.trim() })
      .select()
      .single();

    if (error) {
      toast.error('Failed to create client');
    } else if (data) {
      setClients([...clients, data]);
      setSelectedClientId(data.id);
      setNewClientName('');
    }
    setIsCreatingClient(false);
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || !selectedClientId || selectedClientId === 'new') return;

    setIsCreatingProject(true);
    const { data, error } = await supabase
      .from('external_projects')
      .insert({ 
        name: newProjectName.trim(),
        client_id: selectedClientId,
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to create project');
    } else if (data) {
      setProjects([...projects, data]);
      setSelectedProjectId(data.id);
      setNewProjectName('');
    }
    setIsCreatingProject(false);
  };

  const handleSend = async () => {
    if (!selectedProjectId || selectedProjectId === 'new' || !reviewName.trim() || !password.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (selectedImages.length === 0) {
      toast.error('No images selected');
      return;
    }

    setIsSending(true);

    try {
      // Hash the password
      const hashResponse = await supabase.functions.invoke('hash-password', {
        body: { password },
      });

      if (hashResponse.error) throw new Error('Failed to hash password');
      const { hash } = hashResponse.data;

      // Create the review
      const { data: review, error: reviewError } = await supabase
        .from('client_reviews')
        .insert({
          name: reviewName.trim(),
          password_hash: hash,
          project_id: selectedProjectId,
          status: 'pending',
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
        .from('client_review_items')
        .insert(reviewItems);

      if (itemsError) throw itemsError;

      toast.success('Review sent to client successfully!');
      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error('Error sending to client:', error);
      toast.error('Failed to send review');
    }

    setIsSending(false);
  };

  const resetForm = () => {
    setSelectedClientId('');
    setSelectedProjectId('');
    setNewClientName('');
    setNewProjectName('');
    setReviewName('');
    setPassword('');
  };

  const filteredProjects = projects.filter(
    (p) => p.client_id === selectedClientId
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send to Client Review</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Client Selection */}
          <div className="space-y-2">
            <Label>Client</Label>
            {selectedClientId === 'new' ? (
              <div className="flex gap-2">
                <Input
                  placeholder="Enter client name"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                />
                <Button
                  size="sm"
                  onClick={handleCreateClient}
                  disabled={isCreatingClient || !newClientName.trim()}
                >
                  {isCreatingClient ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedClientId('')}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="new">
                    <span className="flex items-center gap-2">
                      <Plus className="h-4 w-4" /> Create New Client
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Project Selection */}
          {selectedClientId && selectedClientId !== 'new' && (
            <div className="space-y-2">
              <Label>Project</Label>
              {selectedProjectId === 'new' ? (
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter project name"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                  />
                  <Button
                    size="sm"
                    onClick={handleCreateProject}
                    disabled={isCreatingProject || !newProjectName.trim()}
                  >
                    {isCreatingProject ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedProjectId('')}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredProjects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="new">
                      <span className="flex items-center gap-2">
                        <Plus className="h-4 w-4" /> Create New Project
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Review Name */}
          {selectedProjectId && selectedProjectId !== 'new' && (
            <>
              <div className="space-y-2">
                <Label>Review Name</Label>
                <Input
                  placeholder="e.g., Spring Collection - Round 1"
                  value={reviewName}
                  onChange={(e) => setReviewName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Client Password</Label>
                <Input
                  type="password"
                  placeholder="Password for client access"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="text-sm text-muted-foreground">
                {selectedImages.length} image(s) selected across{' '}
                {new Set(selectedImages.map((i) => i.lookId)).size} look(s)
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={
              isSending ||
              !selectedProjectId ||
              selectedProjectId === 'new' ||
              !reviewName.trim() ||
              !password.trim()
            }
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Send to Client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}