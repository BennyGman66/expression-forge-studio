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
      <span ref={ref} className="inline-flex flex-col items-center justify-center gap-2">
        <span className="relative inline-block">
          <img
            src={leapfrogLogo}
            alt="Loading"
            className={`${sizeClasses[size]} animate-leapfrog-hop`}
          />
          {/* Shadow that shrinks when frog jumps */}
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-1.5 bg-black/20 rounded-full animate-leapfrog-shadow" />
        </span>
        {message && (
          <span className="text-xs text-muted-foreground animate-pulse">{message}</span>
        )}
      </span>
    );
  }
);

LeapfrogLoader.displayName = "LeapfrogLoader";
