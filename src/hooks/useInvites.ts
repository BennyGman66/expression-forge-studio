import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Invite } from '@/types/jobs';

export function useValidateInvite(token: string | null) {
  return useQuery({
    queryKey: ['invite', token],
    queryFn: async () => {
      if (!token) return null;
      
      const { data, error } = await supabase
        .from('invites')
        .select('*')
        .eq('token', token)
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .single();
      
      if (error) throw error;
      return data as Invite;
    },
    enabled: !!token,
    retry: false,
  });
}

export function useMarkInviteUsed() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (token: string) => {
      const { error } = await supabase
        .from('invites')
        .update({ used_at: new Date().toISOString() })
        .eq('token', token);
      
      if (error) throw error;
    },
    onSuccess: (_, token) => {
      queryClient.invalidateQueries({ queryKey: ['invite', token] });
    },
  });
}

export function useCreateInvite() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      role, 
      email, 
      jobId,
      projectId,
      expiresInDays = 7 
    }: { 
      role: 'admin' | 'internal' | 'freelancer' | 'client';
      email?: string;
      jobId?: string;
      projectId?: string;
      expiresInDays?: number;
    }) => {
      const token = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
      
      const { data: userData } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('invites')
        .insert({
          token,
          role,
          email: email || null,
          job_id: jobId || null,
          project_id: projectId || null,
          expires_at: expiresAt.toISOString(),
          created_by: userData.user?.id || null,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data as Invite;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invites'] });
    },
  });
}
