import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type AppRole = 'admin' | 'internal' | 'freelancer' | 'client';

export interface UserWithRoles {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  roles: AppRole[];
}

export function useUsers() {
  return useQuery({
    queryKey: ["users-with-roles"],
    queryFn: async () => {
      // Get all users
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("*")
        .order("created_at", { ascending: false });

      if (usersError) throw usersError;

      // Get all roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      // Combine users with their roles
      const usersWithRoles: UserWithRoles[] = users.map((user) => ({
        ...user,
        roles: roles
          .filter((r) => r.user_id === user.id)
          .map((r) => r.role as AppRole),
      }));

      return usersWithRoles;
    },
  });
}

export function useFreelancers() {
  return useQuery({
    queryKey: ["freelancers"],
    queryFn: async () => {
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "freelancer");

      if (rolesError) throw rolesError;

      if (roles.length === 0) return [];

      const userIds = roles.map((r) => r.user_id);
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("*")
        .in("id", userIds);

      if (usersError) throw usersError;
      return users;
    },
  });
}

export function useAssignRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { data, error } = await supabase.functions.invoke("assign-role", {
        body: { userId, role },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users-with-roles"] });
      queryClient.invalidateQueries({ queryKey: ["freelancers"] });
      toast.success("Role assigned successfully");
    },
    onError: (error) => {
      toast.error(`Failed to assign role: ${error.message}`);
    },
  });
}

export function useRemoveRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", role);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users-with-roles"] });
      queryClient.invalidateQueries({ queryKey: ["freelancers"] });
      toast.success("Role removed successfully");
    },
    onError: (error) => {
      toast.error(`Failed to remove role: ${error.message}`);
    },
  });
}
