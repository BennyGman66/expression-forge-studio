import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Check, ChevronDown, ChevronRight, Eye, EyeOff, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ReviewCurationPanelProps {
  onBack: () => void;
}

interface GenerationJob {
  id: string;
  status: string;
  created_at: string;
  brand_id: string;
  talent_id: string;
  brands?: { name: string };
  talents?: { name: string };
}

interface Generation {
  id: string;
  stored_url: string;
  look_id: string | null;
  slot: string | null;
  attempt_index: number;
  generation_job_id: string;
}

interface LookInfo {
  id: string;
  name: string;
  talent_name: string;
}

const SLOT_LABELS: Record<string, string> = {
  A: "Full Front",
  B: "Cropped Front",
  C: "Full Back",
  D: "Detail",
};

export function ReviewCurationPanel({ onBack }: ReviewCurationPanelProps) {
  const [step, setStep] = useState<"select-job" | "curate" | "details">("select-job");
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<GenerationJob | null>(null);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [lookInfoMap, setLookInfoMap] = useState<Record<string, LookInfo>>({});
  const [expandedLooks, setExpandedLooks] = useState<Set<string>>(new Set());
  const [selectedBySlot, setSelectedBySlot] = useState<Record<string, Set<string>>>({});
  const [reviewName, setReviewName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch completed generation jobs
  useEffect(() => {
    const fetchJobs = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("generation_jobs")
          .select(`
            id, status, created_at, brand_id, talent_id,
            brands:brand_id (name),
            talents:talent_id (name)
          `)
          .eq("status", "completed")
          .order("created_at", { ascending: false });

        if (error) throw error;
        setJobs((data as any) || []);
      } catch (error) {
        console.error("Error fetching jobs:", error);
        toast({
          title: "Error",
          description: "Failed to load generation jobs",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchJobs();
  }, []);

  // Fetch generations for selected job
  useEffect(() => {
    if (!selectedJob) return;

    const fetchGenerations = async () => {
      setIsLoading(true);
      try {
        const { data: genData, error: genError } = await supabase
          .from("generations")
          .select("*")
          .eq("generation_job_id", selectedJob.id);

        if (genError) throw genError;

        setGenerations(genData || []);

        // Fetch look info
        const lookIds = [...new Set((genData || []).map((g) => g.look_id).filter(Boolean))];
        if (lookIds.length > 0) {
          const { data: lookData, error: lookError } = await supabase
            .from("talent_looks")
            .select("id, name, talent_id, talents:talent_id (name)")
            .in("id", lookIds);

          if (lookError) throw lookError;

          const lookMap: Record<string, LookInfo> = {};
          (lookData || []).forEach((look: any) => {
            lookMap[look.id] = {
              id: look.id,
              name: look.name,
              talent_name: look.talents?.name || "Unknown",
            };
          });
          setLookInfoMap(lookMap);

          // Expand first look by default
          if (lookIds.length > 0) {
            setExpandedLooks(new Set([lookIds[0] as string]));
          }
        }
      } catch (error) {
        console.error("Error fetching generations:", error);
        toast({
          title: "Error",
          description: "Failed to load generations",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchGenerations();
  }, [selectedJob]);

  // Group generations by look and slot
  const groupedByLook = useMemo(() => {
    const result: Record<string, Record<string, Generation[]>> = {};

    generations.forEach((gen) => {
      const lookId = gen.look_id || "unknown";
      const slot = gen.slot || "A";

      if (!result[lookId]) {
        result[lookId] = {};
      }
      if (!result[lookId][slot]) {
        result[lookId][slot] = [];
      }
      result[lookId][slot].push(gen);
    });

    return result;
  }, [generations]);

  const toggleSelection = (lookId: string, slot: string, generationId: string) => {
    const key = `${lookId}-${slot}`;
    const current = selectedBySlot[key] || new Set();

    if (current.has(generationId)) {
      current.delete(generationId);
    } else if (current.size < 3) {
      current.add(generationId);
    } else {
      toast({
        title: "Maximum reached",
        description: "You can only select up to 3 images per shot type",
      });
      return;
    }

    setSelectedBySlot({ ...selectedBySlot, [key]: new Set(current) });
  };

  const isSelected = (lookId: string, slot: string, generationId: string) => {
    const key = `${lookId}-${slot}`;
    return selectedBySlot[key]?.has(generationId) || false;
  };

  const getSelectionCount = (lookId: string, slot: string) => {
    const key = `${lookId}-${slot}`;
    return selectedBySlot[key]?.size || 0;
  };

  const getTotalSelections = () => {
    return Object.values(selectedBySlot).reduce((sum, set) => sum + set.size, 0);
  };

  const handleSaveReview = async () => {
    if (!reviewName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a review name",
        variant: "destructive",
      });
      return;
    }

    if (!password.trim() || password.length < 4) {
      toast({
        title: "Password required",
        description: "Please enter a password (minimum 4 characters)",
        variant: "destructive",
      });
      return;
    }

    const totalSelections = getTotalSelections();
    if (totalSelections === 0) {
      toast({
        title: "No images selected",
        description: "Please select at least one image for the review",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      // Hash password via edge function
      const { data: hashData, error: hashError } = await supabase.functions.invoke(
        "hash-password",
        { body: { password } }
      );

      if (hashError) throw hashError;

      // Create review
      const { data: reviewData, error: reviewError } = await supabase
        .from("client_reviews")
        .insert({
          name: reviewName.trim(),
          password_hash: hashData.hash,
          status: "sent",
          generation_job_id: selectedJob?.id || null,
        })
        .select()
        .single();

      if (reviewError) throw reviewError;

      // Create review items
      const items: Array<{
        review_id: string;
        generation_id: string;
        look_id: string | null;
        slot: string;
        position: number;
      }> = [];

      Object.entries(selectedBySlot).forEach(([key, generationIds]) => {
        const [lookId, slot] = key.split("-");
        let position = 0;
        generationIds.forEach((genId) => {
          items.push({
            review_id: reviewData.id,
            generation_id: genId,
            look_id: lookId === "unknown" ? null : lookId,
            slot,
            position: position++,
          });
        });
      });

      const { error: itemsError } = await supabase
        .from("client_review_items")
        .insert(items);

      if (itemsError) throw itemsError;

      toast({
        title: "Review created",
        description: "The review has been created and is ready to share",
      });

      onBack();
    } catch (error) {
      console.error("Error saving review:", error);
      toast({
        title: "Error",
        description: "Failed to create review",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (step === "select-job") {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl">Create Review</h1>
            <p className="text-muted-foreground mt-1">
              Step 1: Select a completed generation job
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            Loading jobs...
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No completed generation jobs found
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {jobs.map((job) => (
              <Card
                key={job.id}
                className={cn(
                  "cursor-pointer transition-all hover:border-primary/50",
                  selectedJob?.id === job.id && "border-primary ring-1 ring-primary"
                )}
                onClick={() => {
                  setSelectedJob(job);
                  setStep("curate");
                }}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    {job.brands?.name || "Unknown Brand"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>Talent: {job.talents?.name || "Unknown"}</p>
                    <p>
                      Created: {new Date(job.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (step === "curate") {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setStep("select-job")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl">Curate Images</h1>
              <p className="text-muted-foreground mt-1">
                Step 2: Select up to 3 images per shot type for each look
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant="outline" className="text-base px-4 py-1">
              {getTotalSelections()} selected
            </Badge>
            <Button
              onClick={() => setStep("details")}
              disabled={getTotalSelections() === 0}
            >
              Next: Set Details
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            Loading images...
          </div>
        ) : Object.keys(groupedByLook).length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No images found for this job
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedByLook).map(([lookId, slotGroups]) => {
              const lookInfo = lookInfoMap[lookId];
              const isExpanded = expandedLooks.has(lookId);

              return (
                <Card key={lookId}>
                  <CardHeader
                    className="cursor-pointer"
                    onClick={() => {
                      const next = new Set(expandedLooks);
                      if (isExpanded) {
                        next.delete(lookId);
                      } else {
                        next.add(lookId);
                      }
                      setExpandedLooks(next);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        )}
                        <CardTitle className="text-lg">
                          {lookInfo?.name || `Look ${lookId.slice(0, 8)}`}
                        </CardTitle>
                        {lookInfo && (
                          <span className="text-sm text-muted-foreground">
                            ({lookInfo.talent_name})
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {["A", "B", "C", "D"].map((slot) => {
                          const count = getSelectionCount(lookId, slot);
                          if (count === 0) return null;
                          return (
                            <Badge key={slot} variant="secondary" className="text-xs">
                              {SLOT_LABELS[slot]}: {count}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="space-y-6">
                      {["A", "B", "C", "D"].map((slot) => {
                        const images = slotGroups[slot] || [];
                        if (images.length === 0) return null;

                        return (
                          <div key={slot}>
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-medium">
                                {SLOT_LABELS[slot]} ({slot})
                              </h4>
                              <span className="text-sm text-muted-foreground">
                                {getSelectionCount(lookId, slot)}/3 selected
                              </span>
                            </div>
                            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                              {images.map((gen) => {
                                const selected = isSelected(lookId, slot, gen.id);
                                return (
                                  <div
                                    key={gen.id}
                                    className={cn(
                                      "relative aspect-square rounded-md overflow-hidden cursor-pointer border-2 transition-all",
                                      selected
                                        ? "border-primary ring-2 ring-primary/30"
                                        : "border-transparent hover:border-muted-foreground/30"
                                    )}
                                    onClick={() => toggleSelection(lookId, slot, gen.id)}
                                  >
                                    <img
                                      src={gen.stored_url}
                                      alt=""
                                      className="w-full h-full object-cover"
                                    />
                                    {selected && (
                                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                        <Check className="h-6 w-6 text-primary" />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Step: details
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => setStep("curate")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl">Review Details</h1>
          <p className="text-muted-foreground mt-1">
            Step 3: Set a name and password for the review
          </p>
        </div>
      </div>

      <Card className="max-w-md">
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="review-name">Review Name</Label>
            <Input
              id="review-name"
              placeholder="e.g., Spring 2025 - Rika Looks"
              value={reviewName}
              onChange={(e) => setReviewName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Access Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter password for client access"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Clients will need this password to access the review
            </p>
          </div>

          <div className="pt-4 flex gap-2">
            <Button
              onClick={handleSaveReview}
              disabled={isSaving}
              className="flex-1"
            >
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? "Creating..." : "Create Review"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
