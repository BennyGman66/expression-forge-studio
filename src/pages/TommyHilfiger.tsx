import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TommyHilfiger() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            className="h-8 w-8"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold text-foreground">
            Tommy Hilfiger - Self Serve Beta Test
          </h1>
        </div>
      </header>

      <main className="px-6 py-8">
        <div className="text-center text-muted-foreground">
          <p>Self Serve Beta Test workspace</p>
        </div>
      </main>
    </div>
  );
}
