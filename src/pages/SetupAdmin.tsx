import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Shield, Sparkles, CheckCircle } from 'lucide-react';

export default function SetupAdmin() {
  const { user, roles, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  
  const [isChecking, setIsChecking] = useState(true);
  const [isClaiming, setIsClaiming] = useState(false);
  const [adminExists, setAdminExists] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Check if any admin exists
  useEffect(() => {
    const checkAdminExists = async () => {
      try {
        // Use edge function to check (since RLS might block direct check)
        const { data, error } = await supabase.functions.invoke('assign-role', {
          body: { userId: 'check', role: 'admin' }
        });
        
        // If we get a 403 "admin already exists" error, an admin exists
        if (error?.message?.includes('already exists')) {
          setAdminExists(true);
        } else {
          setAdminExists(false);
        }
      } catch {
        // If we can't check, assume no admin
        setAdminExists(false);
      }
      setIsChecking(false);
    };

    if (user) {
      checkAdminExists();
    }
  }, [user]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [authLoading, user, navigate]);

  // Redirect if user already has a role
  useEffect(() => {
    if (roles.length > 0) {
      navigate('/');
    }
  }, [roles, navigate]);

  const handleClaimAdmin = async () => {
    if (!user) return;
    
    setIsClaiming(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('assign-role', {
        body: { userId: user.id, role: 'admin' }
      });

      if (fnError) {
        setError(fnError.message);
      } else if (data?.error) {
        setError(data.error);
      } else {
        setSuccess(true);
        // Give it a moment then redirect
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to claim admin role');
    }

    setIsClaiming(false);
  };

  if (authLoading || isChecking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (adminExists) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <CardTitle>Admin Already Exists</CardTitle>
            <CardDescription>
              An administrator has already been set up for this platform.
              Please contact your admin to get your role assigned.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => navigate('/auth')}
            >
              Back to Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Leapfrog</h1>
            <p className="text-sm text-muted-foreground">Platform Setup</p>
          </div>
        </div>

        <Card>
          <CardHeader className="text-center">
            <Shield className="w-12 h-12 mx-auto mb-4 text-primary" />
            <CardTitle>Welcome, First User!</CardTitle>
            <CardDescription>
              You're the first person to sign up. Would you like to become the platform administrator?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success ? (
              <Alert className="border-green-500">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <AlertDescription className="text-green-700">
                  Admin role claimed successfully! Redirecting...
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>As an administrator, you will be able to:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Access all internal tools</li>
                    <li>Manage users and assign roles</li>
                    <li>Create and manage jobs</li>
                    <li>Invite freelancers and clients</li>
                  </ul>
                </div>

                <Button 
                  className="w-full" 
                  onClick={handleClaimAdmin}
                  disabled={isClaiming}
                >
                  {isClaiming ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    <>
                      <Shield className="mr-2 h-4 w-4" />
                      Claim Admin Role
                    </>
                  )}
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  Logged in as: {user?.email}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
