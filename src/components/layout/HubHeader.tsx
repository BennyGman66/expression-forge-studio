import { Link } from "react-router-dom";
import { UserMenu } from "./UserMenu";

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
        <UserMenu />
      </div>
    </header>
  );
}
