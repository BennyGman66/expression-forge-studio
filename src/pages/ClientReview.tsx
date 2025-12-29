import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Heart, ChevronDown, ChevronRight, Lock, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ReviewItem {
  id: string;
  generation_id: string;
  look_id: string | null;
  slot: string;
  position: number;
  stored_url: string;
}

interface LookInfo {
  id: string;
  name: string;
  talent_name: string;
}

interface FeedbackState {
  [itemId: string]: {
    is_favorite: boolean;
    comment: string;
  };
}

const SLOT_LABELS: Record<string, string> = {
  A: "Full Front",
  B: "Cropped Front",
  C: "Full Back",
  D: "Detail",
};

export default function ClientReview() {
  const { reviewId } = useParams<{ reviewId: string }>();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [reviewName, setReviewName] = useState("");
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [lookInfoMap, setLookInfoMap] = useState<Record<string, LookInfo>>({});
  const [expandedLooks, setExpandedLooks] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<FeedbackState>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Check session storage for existing auth
  useEffect(() => {
    const sessionKey = `review_auth_${reviewId}`;
    const isAuthed = sessionStorage.getItem(sessionKey) === "true";
    if (isAuthed) {
      setIsAuthenticated(true);
    }
  }, [reviewId]);

  // Fetch review data when authenticated
  useEffect(() => {
    if (!isAuthenticated || !reviewId) return;

    const fetchReviewData = async () => {
      setIsLoading(true);
      try {
        // Fetch review info
        const { data: reviewData, error: reviewError } = await supabase
          .from("client_reviews")
          .select("name")
          .eq("id", reviewId)
          .single();

        if (reviewError) throw reviewError;
        setReviewName(reviewData.name);

        // Fetch review items with generation URLs
        const { data: itemsData, error: itemsError } = await supabase
          .from("client_review_items")
          .select(`
            id, generation_id, look_id, slot, position,
            generations:generation_id (stored_url)
          `)
          .eq("review_id", reviewId)
          .order("position", { ascending: true });

        if (itemsError) throw itemsError;

        const mappedItems = (itemsData || []).map((item: any) => ({
          id: item.id,
          generation_id: item.generation_id,
          look_id: item.look_id,
          slot: item.slot,
          position: item.position,
          stored_url: item.generations?.stored_url || "",
        }));

        setItems(mappedItems);

        // Fetch look info
        const lookIds = [...new Set(mappedItems.map((i) => i.look_id).filter(Boolean))];
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

        // Fetch existing feedback
        const { data: feedbackData, error: feedbackError } = await supabase
          .from("client_review_feedback")
          .select("*")
          .eq("review_id", reviewId);

        if (feedbackError) throw feedbackError;

        const feedbackMap: FeedbackState = {};
        (feedbackData || []).forEach((fb: any) => {
          if (fb.item_id) {
            feedbackMap[fb.item_id] = {
              is_favorite: fb.is_favorite || false,
              comment: fb.comment || "",
            };
          }
        });
        setFeedback(feedbackMap);

        if (feedbackData && feedbackData.length > 0) {
          setHasSubmitted(true);
        }
      } catch (error) {
        console.error("Error fetching review data:", error);
        toast({
          title: "Error",
          description: "Failed to load review",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchReviewData();
  }, [isAuthenticated, reviewId]);

  const handleVerifyPassword = async () => {
    if (!password.trim()) return;

    setIsVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-review-password", {
        body: { reviewId, password },
      });

      if (error) throw error;

      if (data.valid) {
        sessionStorage.setItem(`review_auth_${reviewId}`, "true");
        setIsAuthenticated(true);
      } else {
        toast({
          title: "Invalid password",
          description: "Please check the password and try again",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error verifying password:", error);
      toast({
        title: "Error",
        description: "Failed to verify password",
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const toggleFavorite = (itemId: string) => {
    setFeedback((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        is_favorite: !prev[itemId]?.is_favorite,
        comment: prev[itemId]?.comment || "",
      },
    }));
  };

  const updateComment = (itemId: string, comment: string) => {
    setFeedback((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        is_favorite: prev[itemId]?.is_favorite || false,
        comment,
      },
    }));
  };

  const handleSubmitFeedback = async () => {
    if (!reviewId) return;

    setIsSubmitting(true);
    try {
      // Delete existing feedback
      await supabase
        .from("client_review_feedback")
        .delete()
        .eq("review_id", reviewId);

      // Insert new feedback
      const feedbackRecords = Object.entries(feedback)
        .filter(([_, fb]) => fb.is_favorite || fb.comment.trim())
        .map(([itemId, fb]) => ({
          review_id: reviewId,
          item_id: itemId,
          is_favorite: fb.is_favorite,
          comment: fb.comment.trim() || null,
        }));

      if (feedbackRecords.length > 0) {
        const { error } = await supabase
          .from("client_review_feedback")
          .insert(feedbackRecords);

        if (error) throw error;
      }

      // Update review status
      await supabase
        .from("client_reviews")
        .update({ status: "reviewed" })
        .eq("id", reviewId);

      setHasSubmitted(true);
      toast({
        title: "Feedback submitted",
        description: "Thank you for your feedback!",
      });
    } catch (error) {
      console.error("Error submitting feedback:", error);
      toast({
        title: "Error",
        description: "Failed to submit feedback",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Group items by look and slot
  const groupedByLook = useMemo(() => {
    const result: Record<string, Record<string, ReviewItem[]>> = {};

    items.forEach((item) => {
      const lookId = item.look_id || "unknown";
      const slot = item.slot || "A";

      if (!result[lookId]) {
        result[lookId] = {};
      }
      if (!result[lookId][slot]) {
        result[lookId][slot] = [];
      }
      result[lookId][slot].push(item);
    });

    return result;
  }, [items]);

  const getFavoriteCount = () => {
    return Object.values(feedback).filter((fb) => fb.is_favorite).length;
  };

  // Password gate
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Lock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <CardTitle>Protected Review</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Enter the password to access this review
            </p>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleVerifyPassword()}
              />
            </div>
            <Button
              className="w-full"
              onClick={handleVerifyPassword}
              disabled={isVerifying || !password.trim()}
            >
              {isVerifying ? "Verifying..." : "Access Review"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading review...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl">{reviewName}</h1>
            <p className="text-sm text-muted-foreground">
              Select your favorites and add feedback
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {getFavoriteCount()} favorite(s)
            </span>
            <Button onClick={handleSubmitFeedback} disabled={isSubmitting}>
              <Send className="h-4 w-4 mr-2" />
              {isSubmitting ? "Submitting..." : hasSubmitted ? "Update Feedback" : "Submit Feedback"}
            </Button>
          </div>
        </div>
      </header>

      <main className="p-6">
        {items.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No images found in this review
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
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      )}
                      <CardTitle className="text-lg">
                        {lookInfo?.name || `Look`}
                      </CardTitle>
                      {lookInfo && (
                        <span className="text-sm text-muted-foreground">
                          ({lookInfo.talent_name})
                        </span>
                      )}
                    </div>
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="space-y-8">
                      {["A", "B", "C", "D"].map((slot) => {
                        const slotItems = slotGroups[slot] || [];
                        if (slotItems.length === 0) return null;

                        return (
                          <div key={slot}>
                            <h4 className="font-medium mb-4">
                              {SLOT_LABELS[slot]}
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {slotItems.map((item) => {
                                const itemFeedback = feedback[item.id] || {
                                  is_favorite: false,
                                  comment: "",
                                };

                                return (
                                  <div
                                    key={item.id}
                                    className={cn(
                                      "border rounded-lg overflow-hidden transition-all",
                                      itemFeedback.is_favorite
                                        ? "border-red-400 ring-1 ring-red-400/30"
                                        : "border-border"
                                    )}
                                  >
                                    <div className="relative aspect-square">
                                      <img
                                        src={item.stored_url}
                                        alt=""
                                        className="w-full h-full object-cover"
                                      />
                                      <button
                                        onClick={() => toggleFavorite(item.id)}
                                        className={cn(
                                          "absolute top-2 right-2 p-2 rounded-full transition-all",
                                          itemFeedback.is_favorite
                                            ? "bg-red-500 text-white"
                                            : "bg-black/50 text-white hover:bg-black/70"
                                        )}
                                      >
                                        <Heart
                                          className={cn(
                                            "h-5 w-5",
                                            itemFeedback.is_favorite && "fill-current"
                                          )}
                                        />
                                      </button>
                                    </div>
                                    <div className="p-3">
                                      <Textarea
                                        placeholder="Add a comment..."
                                        value={itemFeedback.comment}
                                        onChange={(e) =>
                                          updateComment(item.id, e.target.value)
                                        }
                                        className="min-h-[60px] text-sm"
                                      />
                                    </div>
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
      </main>
    </div>
  );
}
