import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ShieldX, ArrowLeft, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function Unauthorized() {
  const { signOut, user } = useAuth();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
          <ShieldX className="w-8 h-8 text-destructive" />
        </div>
        
        <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
        <p className="text-muted-foreground mb-6">
          You don't have permission to access this page. 
          {user && (
            <span className="block mt-2">
              Logged in as: <strong>{user.email}</strong>
            </span>
          )}
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild variant="outline">
            <Link to="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Home
            </Link>
          </Button>
          
          <Button 
            variant="ghost" 
            onClick={signOut}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
