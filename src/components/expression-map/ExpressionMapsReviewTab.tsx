import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface ExpressionMapExport {
  id: string;
  project_id: string;
  name: string;
  image_urls: string[];
  output_ids: string[];
  created_at: string;
}

interface ExpressionMapsReviewTabProps {
  projectId: string;
}

export function ExpressionMapsReviewTab({ projectId }: ExpressionMapsReviewTabProps) {
  const [exports, setExports] = useState<ExpressionMapExport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExport, setSelectedExport] = useState<ExpressionMapExport | null>(null);

  useEffect(() => {
    fetchExports();
  }, [projectId]);

  const fetchExports = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("expression_map_exports")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching exports:", error);
      toast.error("Failed to load expression maps");
    } else {
      setExports(
        (data || []).map((e) => ({
          ...e,
          image_urls: Array.isArray(e.image_urls) ? (e.image_urls as string[]) : [],
          output_ids: Array.isArray(e.output_ids) ? (e.output_ids as string[]) : [],
        }))
      );
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from("expression_map_exports")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Failed to delete");
    } else {
      toast.success("Expression map deleted");
      setExports((prev) => prev.filter((e) => e.id !== id));
      if (selectedExport?.id === id) setSelectedExport(null);
    }
  };

  const handleDownload = async (exp: ExpressionMapExport) => {
    const imageUrls = exp.image_urls;
    if (imageUrls.length === 0) return;

    const cols = 5;
    const cellSize = 400;
    const gap = 8;
    const rows = Math.ceil(imageUrls.length / cols);
    const canvasWidth = cols * cellSize + (cols - 1) * gap;
    const canvasHeight = rows * cellSize + (rows - 1) * gap;

    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#e8e6e1";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const loadImage = (url: string): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });
    };

    toast.info("Generating PNG...");

    try {
      for (let i = 0; i < imageUrls.length; i++) {
        const url = imageUrls[i];
        const img = await loadImage(url);
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = col * (cellSize + gap);
        const y = row * (cellSize + gap);

        const scale = Math.max(cellSize / img.width, cellSize / img.height);
        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;
        const offsetX = (cellSize - scaledWidth) / 2;
        const offsetY = (cellSize - scaledHeight) / 2;

        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, cellSize, cellSize);
        ctx.clip();
        ctx.drawImage(img, x + offsetX, y + offsetY, scaledWidth, scaledHeight);
        ctx.restore();
      }

      const link = document.createElement("a");
      link.download = `${exp.name.replace(/\s+/g, "-")}-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success("Grid exported!");
    } catch (error) {
      console.error("Export failed:", error);
      toast.error("Failed to export grid");
    }
  };

  if (selectedExport) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-serif">{selectedExport.name}</h2>
            <p className="text-sm text-muted-foreground">
              {selectedExport.image_urls.length} expressions • Saved{" "}
              {format(new Date(selectedExport.created_at), "MMM d, yyyy")}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setSelectedExport(null)}>
              Back
            </Button>
            <Button onClick={() => handleDownload(selectedExport)}>
              <Download className="w-4 h-4 mr-2" />
              Download PNG
            </Button>
          </div>
        </div>

        <div
          className="grid grid-cols-5 gap-2 p-4"
          style={{ backgroundColor: "#e8e6e1" }}
        >
          {selectedExport.image_urls.map((url, i) => (
            <div key={i} className="aspect-square overflow-hidden">
              <img src={url} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-16 text-muted-foreground">Loading...</div>
    );
  }

  if (exports.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p>No expression maps locked in yet</p>
        <p className="text-sm">Select expressions in the Review tab and lock them in</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-serif">Expression Maps</h2>
        <p className="text-sm text-muted-foreground">
          Previously locked-in expression selections
        </p>
      </div>

      <div className="grid gap-4">
        {exports.map((exp) => (
          <div
            key={exp.id}
            className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-4">
              {exp.image_urls.length > 0 && (
                <div className="w-16 h-16 rounded overflow-hidden bg-muted">
                  <img
                    src={exp.image_urls[0]}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div>
                <h3 className="font-medium">{exp.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {exp.image_urls.length} expressions •{" "}
                  {format(new Date(exp.created_at), "MMM d, yyyy 'at' h:mm a")}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedExport(exp)}
              >
                <Eye className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDownload(exp)}
              >
                <Download className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(exp.id)}
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
