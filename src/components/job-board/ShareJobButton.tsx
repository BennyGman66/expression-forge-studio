import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Link2, Copy, Check, Loader2 } from 'lucide-react';

interface ShareJobButtonProps {
  jobId: string;
  accessToken: string | null;
}

export function ShareJobButton({ jobId, accessToken }: ShareJobButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();

  const generateToken = useMutation({
    mutationFn: async () => {
      const token = crypto.randomUUID();
      const { error } = await supabase
        .from('unified_jobs')
        .update({ access_token: token })
        .eq('id', jobId);
      
      if (error) throw error;
      return token;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unified-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['unified-job', jobId] });
    },
    onError: (error) => {
      toast.error(`Failed to generate link: ${error.message}`);
    },
  });

  const handleOpen = async (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && !accessToken) {
      await generateToken.mutateAsync();
    }
  };

  const shareUrl = accessToken 
    ? `${window.location.origin}/work/${accessToken}`
    : null;

  const handleCopy = async () => {
    if (!shareUrl) return;
    
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Failed to copy link');
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8"
          onClick={(e) => e.stopPropagation()}
        >
          <Link2 className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-80" 
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-sm mb-1">Share with Freelancer</h4>
            <p className="text-xs text-muted-foreground">
              Anyone with this link can access this job and submit work.
            </p>
          </div>
          
          {generateToken.isPending ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : shareUrl ? (
            <div className="flex gap-2">
              <Input 
                value={shareUrl} 
                readOnly 
                className="text-xs"
                onClick={(e) => e.currentTarget.select()}
              />
              <Button size="icon" variant="outline" onClick={handleCopy}>
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
