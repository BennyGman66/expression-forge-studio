import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";

interface OutputTile {
  title: string;
  description: string;
  path: string;
}

const OUTPUT_TILES: OutputTile[] = [
  {
    title: "Image2Video",
    description: "Create videos from images at scale.",
    path: "/external/image2video",
  },
  {
    title: "Studio to Setting",
    description: "Place talent at location without the travel.",
    path: "/external/studio-to-setting",
  },
  {
    title: "Talent Replacement",
    description: "Create PDP using digital talent.",
    path: "/external/talent-replacement",
  },
];

export default function External() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Simple header with avatar placeholder */}
      <header className="flex justify-end p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-lime-400 flex items-center justify-center text-sm font-medium">
            BG
          </div>
          <span className="text-sm text-muted-foreground">ben.garton@leap</span>
        </div>
      </header>

      {/* Main tile grid */}
      <main className="px-6 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl">
          {OUTPUT_TILES.map((tile) => (
            <Card
              key={tile.title}
              onClick={() => navigate(tile.path)}
              className="cursor-pointer hover:shadow-lg transition-all duration-300 border border-border/50 rounded-3xl overflow-hidden bg-card"
            >
              <div className="aspect-[4/3] flex flex-col items-center justify-center p-8 text-center">
                <h2 className="font-serif text-3xl md:text-4xl mb-6 text-foreground">
                  {tile.title}
                </h2>
                <p className="text-muted-foreground text-sm max-w-[200px]">
                  {tile.description}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
