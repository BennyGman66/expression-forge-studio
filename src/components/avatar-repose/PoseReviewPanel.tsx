import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, Download, ChevronDown, ChevronRight, Check, FileText, Send } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import { SendToClientDialog } from "./SendToClientDialog";

const SLOT_LABELS: Record<string, string> = {
  A: "A: Full Front",
  B: "B: Cropped Front",
  C: "C: Full Back",
  D: "D: Detail",
};

interface GenerationWithMeta {
  id: string;
  generation_job_id: string;
  pose_clay_image_id: string;
  attempt_index: number;
  stored_url: string;
  created_at: string;
  look_id: string | null;
  view: string | null;
  slot: string | null;
}

interface LookInfo {
  id: string;
  name: string;
  talent_id: string;
  talent_name: string;
  product_type: string | null;
}

interface PoseReviewPanelProps {
  jobIds: string[];
  onBack: () => void;
}

export function PoseReviewPanel({ jobIds, onBack }: PoseReviewPanelProps) {
  const [generations, setGenerations] = useState<GenerationWithMeta[]>([]);
  const [lookInfoMap, setLookInfoMap] = useState<Record<string, LookInfo>>({});
  const [selectedBySlot, setSelectedBySlot] = useState<Record<string, string[]>>({});
  const [expandedLooks, setExpandedLooks] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);

  useEffect(() => {
    fetchGenerations();
  }, [jobIds]);

  const fetchGenerations = async () => {
    if (jobIds.length === 0) return;

    // Fetch generations for all job IDs
    const { data: gens, error } = await supabase
      .from("generations")
      .select("*")
      .in("generation_job_id", jobIds)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching generations:", error);
      return;
    }

    setGenerations((gens || []) as GenerationWithMeta[]);

    // Extract unique look IDs
    const lookIds = [...new Set((gens || []).map(g => g.look_id).filter(Boolean))];
    
    if (lookIds.length > 0) {
      // Fetch look info with talent names
      const { data: looks } = await supabase
        .from("talent_looks")
        .select("id, name, talent_id, product_type, talents(name)")
        .in("id", lookIds);

      const infoMap: Record<string, LookInfo> = {};
      (looks || []).forEach((look: any) => {
        infoMap[look.id] = {
          id: look.id,
          name: look.name,
          talent_id: look.talent_id,
          talent_name: look.talents?.name || "Unknown",
          product_type: look.product_type,
        };
      });
      setLookInfoMap(infoMap);
      
      // Auto-expand first look
      if (lookIds.length > 0 && lookIds[0]) {
        setExpandedLooks([lookIds[0] as string]);
      }
    }
  };

  // Group generations by look, then by slot
  const groupedByLook = useMemo(() => {
    const result: Record<string, Record<string, GenerationWithMeta[]>> = {};

    generations.forEach(gen => {
      const lookKey = gen.look_id || "unknown";
      const slotKey = gen.slot || "unknown";

      if (!result[lookKey]) {
        result[lookKey] = {};
      }
      if (!result[lookKey][slotKey]) {
        result[lookKey][slotKey] = [];
      }
      result[lookKey][slotKey].push(gen);
    });

    return result;
  }, [generations]);

  const toggleSelection = (lookId: string, slot: string, genId: string) => {
    const key = `${lookId}_${slot}`;
    setSelectedBySlot(prev => {
      const current = prev[key] || [];
      if (current.includes(genId)) {
        return { ...prev, [key]: current.filter(id => id !== genId) };
      }
      if (current.length >= 3) {
        toast.error("Maximum 3 selections per shot type");
        return prev;
      }
      return { ...prev, [key]: [...current, genId] };
    });
  };

  const isSelected = (lookId: string, slot: string, genId: string) => {
    const key = `${lookId}_${slot}`;
    return (selectedBySlot[key] || []).includes(genId);
  };

  const getSelectionCount = (lookId: string, slot: string) => {
    const key = `${lookId}_${slot}`;
    return (selectedBySlot[key] || []).length;
  };

  const toggleLookExpanded = (lookId: string) => {
    setExpandedLooks(prev => 
      prev.includes(lookId) 
        ? prev.filter(id => id !== lookId)
        : [...prev, lookId]
    );
  };

  // Count total selections
  const totalSelections = Object.values(selectedBySlot).flat().length;

  // Get selected images for SendToClientDialog
  const getSelectedImages = () => {
    const selected: { generationId: string; slot: string; lookId: string | null }[] = [];
    Object.entries(selectedBySlot).forEach(([key, genIds]) => {
      const [lookId, slot] = key.split("_");
      genIds.forEach((genId) => {
        selected.push({
          generationId: genId,
          slot,
          lookId: lookId === "unknown" ? null : lookId,
        });
      });
    });
    return selected;
  };

  // Export to PDF
  const handleExportPDF = async () => {
    if (totalSelections === 0) {
      toast.error("Select at least one image to export");
      return;
    }

    setIsExporting(true);
    toast.info("Generating PDF...");

    try {
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      const darkGreen = "#1a4d2e";

      // Group selected images by look
      const selectedByLook: Record<string, { info: LookInfo | null; slots: Record<string, string[]> }> = {};

      Object.entries(selectedBySlot).forEach(([key, genIds]) => {
        if (genIds.length === 0) return;
        const [lookId, slot] = key.split("_");
        if (!selectedByLook[lookId]) {
          selectedByLook[lookId] = { 
            info: lookInfoMap[lookId] || null, 
            slots: {} 
          };
        }
        selectedByLook[lookId].slots[slot] = genIds;
      });

      let currentPage = 0;

      for (const [lookId, lookData] of Object.entries(selectedByLook)) {
        if (currentPage > 0) {
          pdf.addPage();
        }
        currentPage++;

        // Dark green background
        pdf.setFillColor(26, 77, 46);
        pdf.rect(0, 0, pageWidth, pageHeight, "F");

        // Header: Talent - Look name
        const headerText = lookData.info 
          ? `${lookData.info.talent_name.toUpperCase()} - ${lookData.info.name.toUpperCase()}`
          : "UNKNOWN LOOK";
        
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(24);
        pdf.setFont("helvetica", "bold");
        pdf.text(headerText, pageWidth / 2, margin + 10, { align: "center" });

        let yOffset = margin + 30;
        const imageWidth = (pageWidth - margin * 4) / 3;
        const imageHeight = imageWidth * 1.33; // 3:4 aspect ratio
        const spacing = 10;

        // Sort slots: A, B, C, D
        const sortedSlots = Object.entries(lookData.slots).sort(([a], [b]) => a.localeCompare(b));

        for (const [slot, genIds] of sortedSlots) {
          // Check if we need a new page
          if (yOffset + imageHeight + 30 > pageHeight - margin) {
            pdf.addPage();
            pdf.setFillColor(26, 77, 46);
            pdf.rect(0, 0, pageWidth, pageHeight, "F");
            yOffset = margin + 10;
          }

          // Slot label
          pdf.setFontSize(14);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(255, 255, 255);
          pdf.text(SLOT_LABELS[slot] || slot, margin, yOffset);
          yOffset += 8;

          // Load and add images
          const selectedGens = generations.filter(g => genIds.includes(g.id));
          
          for (let i = 0; i < selectedGens.length; i++) {
            const gen = selectedGens[i];
            const xPos = margin + i * (imageWidth + spacing);

            try {
              // Fetch image as base64
              const response = await fetch(gen.stored_url);
              const blob = await response.blob();
              const base64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });

              pdf.addImage(base64, "PNG", xPos, yOffset, imageWidth, imageHeight);
            } catch (err) {
              console.error("Failed to load image:", err);
              // Draw placeholder
              pdf.setFillColor(50, 50, 50);
              pdf.rect(xPos, yOffset, imageWidth, imageHeight, "F");
              pdf.setTextColor(150, 150, 150);
              pdf.setFontSize(10);
              pdf.text("Image Error", xPos + imageWidth / 2, yOffset + imageHeight / 2, { align: "center" });
            }
          }

          yOffset += imageHeight + spacing * 2;
        }
      }

      // Save PDF
      const timestamp = new Date().toISOString().split("T")[0];
      pdf.save(`pose-selections-${timestamp}.pdf`);
      toast.success("PDF exported successfully!");
    } catch (error) {
      console.error("PDF export error:", error);
      toast.error("Failed to export PDF");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onBack} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Jobs List
          </Button>
          {jobIds.length > 1 && (
            <Badge variant="secondary" className="text-sm">
              Reviewing {jobIds.length} jobs
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="text-lg">
            {totalSelections} selected
          </Badge>
          <Button 
            variant="outline"
            onClick={() => setShowSendDialog(true)} 
            disabled={totalSelections === 0}
            className="gap-2"
          >
            <Send className="w-4 h-4" />
            Send to Client
          </Button>
          <Button 
            onClick={handleExportPDF} 
            disabled={isExporting || totalSelections === 0}
            className="gap-2"
          >
            <FileText className="w-4 h-4" />
            {isExporting ? "Exporting..." : "Export PDF"}
          </Button>
        </div>
      </div>

      {/* Send to Client Dialog */}
      <SendToClientDialog
        open={showSendDialog}
        onOpenChange={setShowSendDialog}
        selectedImages={getSelectedImages()}
        onSuccess={() => {
          setSelectedBySlot({});
          toast.success("Images sent to client review!");
        }}
      />

      {/* Instructions */}
      <Card className="p-4 bg-muted/50">
        <p className="text-sm text-muted-foreground">
          Select up to <strong>3 favorites per shot type</strong> for each look. 
          Selected images will be exported to a PDF with a dark green background.
        </p>
      </Card>

      {/* Review Grid */}
      <div className="space-y-4">
        {Object.entries(groupedByLook).map(([lookId, slotGroups]) => {
          const lookInfo = lookInfoMap[lookId];
          const isExpanded = expandedLooks.includes(lookId);
          
          return (
            <Card key={lookId} className="overflow-hidden">
              <Collapsible open={isExpanded} onOpenChange={() => toggleLookExpanded(lookId)}>
                <CollapsibleTrigger asChild>
                  <button className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5" />
                      ) : (
                        <ChevronRight className="w-5 h-5" />
                      )}
                      <span className="font-semibold text-lg">
                        {lookInfo ? `${lookInfo.talent_name} - ${lookInfo.name}` : "Unknown Look"}
                      </span>
                      {lookInfo?.product_type && (
                        <Badge variant="secondary">{lookInfo.product_type}</Badge>
                      )}
                    </div>
                    <Badge variant="outline">
                      {Object.values(slotGroups).flat().length} images
                    </Badge>
                  </button>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <div className="p-4 pt-0 space-y-6">
                    {/* Sort slots A, B, C, D */}
                    {Object.entries(slotGroups)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([slot, gens]) => (
                        <div key={slot} className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium">
                              {SLOT_LABELS[slot] || slot}
                            </h4>
                            <Badge variant="outline">
                              {getSelectionCount(lookId, slot)}/3 selected
                            </Badge>
                          </div>
                          
                          <ScrollArea className="w-full">
                            <div className="flex gap-3 pb-2">
                              {gens.map(gen => {
                                const selected = isSelected(lookId, slot, gen.id);
                                return (
                                  <div
                                    key={gen.id}
                                    className={`relative flex-shrink-0 cursor-pointer transition-all rounded-lg overflow-hidden ${
                                      selected 
                                        ? "ring-4 ring-primary scale-[1.02]" 
                                        : "ring-1 ring-border hover:ring-2 hover:ring-primary/50"
                                    }`}
                                    onClick={() => toggleSelection(lookId, slot, gen.id)}
                                  >
                                    <img
                                      src={gen.stored_url}
                                      alt={`Generation ${gen.attempt_index + 1}`}
                                      className="w-40 h-52 object-cover"
                                    />
                                    {selected && (
                                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                                        <Check className="w-4 h-4 text-primary-foreground" />
                                      </div>
                                    )}
                                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                                      <span className="text-xs text-white">
                                        Attempt {gen.attempt_index + 1}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </ScrollArea>
                        </div>
                      ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}

        {Object.keys(groupedByLook).length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">
            <p>No generations found for this job.</p>
            <Button variant="outline" onClick={onBack} className="mt-4">
              Go Back
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}
