import { Link } from "react-router-dom";

interface HubHeaderProps {
  currentApp?: string;
  currentProject?: string;
}

export function HubHeader({ currentApp, currentProject }: HubHeaderProps) {
  return (
    <header className="h-14 border-b border-border bg-card px-6 flex items-center justify-between">
      <nav className="breadcrumb">
        <Link to="/" className="breadcrumb-item hover:text-foreground">
          Hub
        </Link>
        {currentApp && (
          <>
            <span className="breadcrumb-separator">|</span>
            <Link 
              to={`/${currentApp.toLowerCase().replace(/\s+/g, '-')}`}
              className={`breadcrumb-item ${!currentProject ? 'active' : ''}`}
            >
              {currentApp}
            </Link>
          </>
        )}
        {currentProject && (
          <>
            <span className="breadcrumb-separator">|</span>
            <span className="breadcrumb-item active">{currentProject}</span>
          </>
        )}
      </nav>

      <div className="flex items-center gap-4">
        <div className="user-avatar">BG</div>
        <span className="text-sm text-muted-foreground">ben.garton@leapfroginc.ai</span>
        <span className="text-sm text-muted-foreground">Leapfrog Inc</span>
        <button className="btn-outline text-sm py-1.5">Sign Out</button>
      </div>
    </header>
  );
}
