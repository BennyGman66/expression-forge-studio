import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import { toast } from "sonner";
import { Copy, Check, Mail } from "lucide-react";
import { AppRole } from "@/hooks/useUsers";

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteUserDialog({ open, onOpenChange }: InviteUserDialogProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("freelancer");
  const [isCreating, setIsCreating] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generateToken = () => {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  };

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const token = generateToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

      const { error } = await supabase.from("invites").insert({
        token,
        role,
        email: email || null,
        expires_at: expiresAt.toISOString(),
        created_by: user.id,
      });

      if (error) throw error;

      const link = `${window.location.origin}/auth?invite=${token}`;
      setInviteLink(link);
      toast.success("Invite created successfully");
    } catch (error: any) {
      toast.error(`Failed to create invite: ${error.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopy = async () => {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSendEmail = () => {
    if (!inviteLink) return;
    
    const roleName = role === 'internal' ? 'Internal Team Member' 
                   : role === 'freelancer' ? 'Freelancer' 
                   : 'Client';
    
    const subject = encodeURIComponent("You've been invited to join Leapfrog");
    const body = encodeURIComponent(
      `Hi${email ? '' : ' there'},\n\n` +
      `You've been invited to join Leapfrog as a ${roleName}.\n\n` +
      `Click the link below to create your account:\n` +
      `${inviteLink}\n\n` +
      `This link will expire in 7 days.\n\n` +
      `If you have any questions, please reply to this email.\n\n` +
      `Best regards,\nThe Leapfrog Team`
    );
    
    const mailto = `mailto:${email || ''}?subject=${subject}&body=${body}`;
    window.open(mailto, '_blank');
  };

  const handleClose = () => {
    onOpenChange(false);
    setEmail("");
    setRole("freelancer");
    setInviteLink(null);
    setCopied(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite User</DialogTitle>
          <DialogDescription>
            Create an invite link to onboard a new user with a specific role.
          </DialogDescription>
        </DialogHeader>

        {inviteLink ? (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Invite Link</Label>
              <div className="flex gap-2">
                <Input value={inviteLink} readOnly className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={handleCopy}>
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <Button 
                variant="outline" 
                className="w-full mt-2" 
                onClick={handleSendEmail}
              >
                <Mail className="h-4 w-4 mr-2" />
                Send via Email
              </Button>
              <p className="text-xs text-muted-foreground">
                This link expires in 7 days.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Email (optional)</Label>
              <Input
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                If provided, only this email can use the invite link.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="freelancer">Freelancer</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter>
          {inviteLink ? (
            <Button onClick={handleClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={isCreating}>
                {isCreating ? "Creating..." : "Create Invite"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
