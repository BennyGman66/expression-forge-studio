import * as React from "react";
import leapfrogLogo from "@/assets/leapfrog-logo.png";

interface LeapfrogLoaderProps {
  message?: string;
  size?: "sm" | "md" | "lg";
}

export const LeapfrogLoader = React.forwardRef<HTMLDivElement, LeapfrogLoaderProps>(
  ({ message = "Regenerating...", size = "md" }, ref) => {
    const sizeClasses = {
      sm: "w-8 h-8",
      md: "w-12 h-12",
      lg: "w-16 h-16",
    };

    return (
      <div ref={ref} className="flex flex-col items-center justify-center gap-2">
        <div className="relative">
          <img
            src={leapfrogLogo}
            alt="Loading"
            className={`${sizeClasses[size]} animate-leapfrog-hop`}
          />
          {/* Shadow that shrinks when frog jumps */}
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-1.5 bg-black/20 rounded-full animate-leapfrog-shadow" />
        </div>
        {message && (
          <span className="text-xs text-muted-foreground animate-pulse">{message}</span>
        )}
      </div>
    );
  }
);

LeapfrogLoader.displayName = "LeapfrogLoader";
