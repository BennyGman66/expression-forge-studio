import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface FreelancerIdentity {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
}

const STORAGE_KEY = 'freelancer_identity';

export function useFreelancerIdentity() {
  const [identity, setIdentityState] = useState<FreelancerIdentity | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load identity from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setIdentityState(parsed);
      } catch (e) {
        console.error('Failed to parse stored identity:', e);
      }
    }
    setIsLoading(false);
  }, []);

  // Set identity: store in localStorage and upsert to database
  const setIdentity = useCallback(async (firstName: string, lastName: string): Promise<FreelancerIdentity> => {
    setIsLoading(true);
    
    try {
      // Upsert to database using case-insensitive match
      const { data, error } = await supabase
        .from('freelancer_identities')
        .upsert(
          { 
            first_name: firstName.trim(), 
            last_name: lastName.trim() 
          },
          { 
            onConflict: 'id',
            ignoreDuplicates: false 
          }
        )
        .select()
        .single();

      // If upsert failed due to conflict, try to find existing
      if (error) {
        // Try to find existing identity
        const { data: existing, error: findError } = await supabase
          .from('freelancer_identities')
          .select()
          .ilike('first_name', firstName.trim())
          .ilike('last_name', lastName.trim())
          .maybeSingle();

        if (findError) throw findError;

        if (existing) {
          // Update last_active_at
          await supabase
            .from('freelancer_identities')
            .update({ last_active_at: new Date().toISOString() })
            .eq('id', existing.id);

          const identity: FreelancerIdentity = {
            id: existing.id,
            firstName: existing.first_name,
            lastName: existing.last_name,
            displayName: existing.display_name,
          };

          localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
          setIdentityState(identity);
          return identity;
        }

        // If still not found, insert fresh
        const { data: newData, error: insertError } = await supabase
          .from('freelancer_identities')
          .insert({ 
            first_name: firstName.trim(), 
            last_name: lastName.trim() 
          })
          .select()
          .single();

        if (insertError) throw insertError;

        const newIdentity: FreelancerIdentity = {
          id: newData.id,
          firstName: newData.first_name,
          lastName: newData.last_name,
          displayName: newData.display_name,
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(newIdentity));
        setIdentityState(newIdentity);
        return newIdentity;
      }

      const identity: FreelancerIdentity = {
        id: data.id,
        firstName: data.first_name,
        lastName: data.last_name,
        displayName: data.display_name,
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
      setIdentityState(identity);
      return identity;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearIdentity = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setIdentityState(null);
  }, []);

  return {
    identity,
    setIdentity,
    clearIdentity,
    isLoading,
    hasIdentity: !!identity,
  };
}
