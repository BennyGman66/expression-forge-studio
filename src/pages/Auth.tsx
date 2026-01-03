import { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useValidateInvite, useMarkInviteUsed } from '@/hooks/useInvites';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, Mail, Lock, User, Sparkles, UserPlus } from 'lucide-react';
import { z } from 'zod';

const emailSchema = z.string().email('Please enter a valid email address');
const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');

export default function Auth() {
  const { user, roles, signIn, signUp, signInWithMagicLink, isFreelancer } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  
  const inviteToken = searchParams.get('invite');
  const { data: invite, isLoading: inviteLoading } = useValidateInvite(inviteToken);
  const markInviteUsed = useMarkInviteUsed();
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  // Pre-fill email from invite if specified
  useEffect(() => {
    if (invite?.email) {
      setEmail(invite.email);
    }
  }, [invite]);

  // Redirect if already authenticated
  useEffect(() => {
    if (user && roles.length > 0) {
      // Role-based redirect
      if (isFreelancer && !roles.includes('admin') && !roles.includes('internal')) {
        navigate('/freelancer', { replace: true });
      } else {
        const from = (location.state as { from?: Location })?.from?.pathname || '/';
        navigate(from, { replace: true });
      }
    }
  }, [user, roles, isFreelancer, navigate, location]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    try {
      emailSchema.parse(email);
      passwordSchema.parse(password);
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        setError(validationError.errors[0].message);
        return;
      }
    }
    
    setIsLoading(true);
    const { error } = await signIn(email, password);
    setIsLoading(false);
    
    if (error) {
      setError(error.message);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // Validate invite email match if specified
    if (invite?.email && email.toLowerCase() !== invite.email.toLowerCase()) {
      setError(`This invite is only valid for ${invite.email}`);
      return;
    }
    
    try {
      emailSchema.parse(email);
      passwordSchema.parse(password);
      if (!displayName.trim()) {
        throw new Error('Display name is required');
      }
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        setError(validationError.errors[0].message);
        return;
      }
      if (validationError instanceof Error) {
        setError(validationError.message);
        return;
      }
    }
    
    setIsLoading(true);
    const { error: signUpError } = await signUp(email, password, displayName);
    
    if (signUpError) {
      setIsLoading(false);
      if (signUpError.message.includes('already registered')) {
        setError('This email is already registered. Please sign in instead.');
      } else {
        setError(signUpError.message);
      }
      return;
    }
    
    // If there's a valid invite, assign the role after signup
    if (invite && inviteToken) {
      try {
        // Get the newly created user
        const { data: { user: newUser } } = await supabase.auth.getUser();
        
        if (newUser) {
          // Assign the role from the invite
          const { error: roleError } = await supabase.functions.invoke('assign-role', {
            body: { userId: newUser.id, role: invite.role },
          });
          
          if (roleError) {
            console.error('Failed to assign role:', roleError);
          }
          
          // Mark invite as used
          await markInviteUsed.mutateAsync(inviteToken);
        }
      } catch (roleAssignError) {
        console.error('Error assigning role from invite:', roleAssignError);
      }
    }
    
    setIsLoading(false);
    setSuccess('Account created successfully! You can now sign in.');
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    try {
      emailSchema.parse(email);
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        setError(validationError.errors[0].message);
        return;
      }
    }
    
    setIsLoading(true);
    const { error } = await signInWithMagicLink(email);
    setIsLoading(false);
    
    if (error) {
      setError(error.message);
    } else {
      setSuccess('Check your email for the magic link!');
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-500/20 text-red-400';
      case 'internal': return 'bg-blue-500/20 text-blue-400';
      case 'freelancer': return 'bg-green-500/20 text-green-400';
      case 'client': return 'bg-purple-500/20 text-purple-400';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Brand */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Leapfrog</h1>
            <p className="text-sm text-muted-foreground">Digital Content Platform</p>
          </div>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle>Welcome</CardTitle>
            <CardDescription>
              {invite ? (
                <span className="flex flex-col items-center gap-2">
                  <span>You've been invited to join as</span>
                  <Badge className={getRoleBadgeColor(invite.role)}>
                    <UserPlus className="w-3 h-3 mr-1" />
                    {invite.role.charAt(0).toUpperCase() + invite.role.slice(1)}
                  </Badge>
                </span>
              ) : (
                'Sign in to access the platform'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {inviteLoading && inviteToken && (
              <div className="flex items-center justify-center py-4 text-muted-foreground">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Validating invite...
              </div>
            )}
            
            {inviteToken && !inviteLoading && !invite && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>
                  This invite link is invalid or has expired.
                </AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            {success && (
              <Alert className="mb-4 border-green-500 text-green-700">
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}

            <Tabs defaultValue={invite ? 'signup' : 'signin'} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
                <TabsTrigger value="magic">Magic Link</TabsTrigger>
              </TabsList>

              {/* Sign In Tab */}
              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signin-email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="signin-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signin-password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      'Sign In'
                    )}
                  </Button>
                </form>
              </TabsContent>

              {/* Sign Up Tab */}
              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Display Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signup-name"
                        type="text"
                        placeholder="Your name"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signup-password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Must be at least 6 characters
                    </p>
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating account...
                      </>
                    ) : (
                      'Create Account'
                    )}
                  </Button>
                </form>
              </TabsContent>

              {/* Magic Link Tab (for freelancers) */}
              <TabsContent value="magic">
                <form onSubmit={handleMagicLink} className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    For freelancers: Enter your email to receive a passwordless login link.
                  </p>
                  
                  <div className="space-y-2">
                    <Label htmlFor="magic-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="magic-email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending link...
                      </>
                    ) : (
                      'Send Magic Link'
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
