import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Heart, ArrowLeft, Send, MessageSquare } from "lucide-react";
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
  const navigate = useNavigate();
  const [reviewName, setReviewName] = useState("");
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [lookInfoMap, setLookInfoMap] = useState<Record<string, LookInfo>>({});
  const [feedback, setFeedback] = useState<FeedbackState>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [selectedLookId, setSelectedLookId] = useState<string | null>(null);

  // Fetch review data on mount
  useEffect(() => {
    if (!reviewId) return;

    const fetchReviewData = async () => {
      setIsLoading(true);
      try {
        // Fetch review info
        const { data: reviewData, error: reviewError } = await supabase
          .from("client_reviews")
          .select("name")
          .eq("id", reviewId)
          .maybeSingle();

        if (reviewError) throw reviewError;
        if (!reviewData) {
          toast({
            title: "Review not found",
            description: "This review link may be invalid",
            variant: "destructive",
          });
          return;
        }
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
  }, [reviewId]);

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

  // Group items by look
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

  const lookIds = Object.keys(groupedByLook);

  const getFavoriteCount = () => {
    return Object.values(feedback).filter((fb) => fb.is_favorite).length;
  };

  const getCommentCountForLook = (lookId: string) => {
    const slots = groupedByLook[lookId] || {};
    let count = 0;
    Object.values(slots).forEach((slotItems) => {
      slotItems.forEach((item) => {
        if (feedback[item.id]?.comment.trim()) count++;
      });
    });
    return count;
  };

  const getFavoriteCountForLook = (lookId: string) => {
    const slots = groupedByLook[lookId] || {};
    let count = 0;
    Object.values(slots).forEach((slotItems) => {
      slotItems.forEach((item) => {
        if (feedback[item.id]?.is_favorite) count++;
      });
    });
    return count;
  };

  const getLookThumbnails = (lookId: string) => {
    const slots = groupedByLook[lookId] || {};
    const images: string[] = [];
    ["A", "B", "C", "D"].forEach((slot) => {
      if (slots[slot]?.[0]?.stored_url) {
        images.push(slots[slot][0].stored_url);
      }
    });
    return images.slice(0, 4);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading review...</p>
      </div>
    );
  }

  // Detail view for a selected look
  if (selectedLookId) {
    const lookInfo = lookInfoMap[selectedLookId];
    const slotGroups = groupedByLook[selectedLookId] || {};

    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-card sticky top-0 z-10">
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedLookId(null)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Looks
              </Button>
              <div>
                <h1 className="text-xl font-medium">
                  {lookInfo?.name || "Look"}
                </h1>
                {lookInfo && (
                  <p className="text-sm text-muted-foreground">
                    {lookInfo.talent_name}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                {getFavoriteCount()} favorite(s) total
              </span>
              <Button onClick={handleSubmitFeedback} disabled={isSubmitting}>
                <Send className="h-4 w-4 mr-2" />
                {isSubmitting
                  ? "Submitting..."
                  : hasSubmitted
                    ? "Update Feedback"
                    : "Submit Feedback"}
              </Button>
            </div>
          </div>
        </header>

        <main className="p-6 space-y-8">
          {["A", "B", "C", "D"].map((slot) => {
            const slotItems = slotGroups[slot] || [];
            if (slotItems.length === 0) return null;

            return (
              <div key={slot}>
                <h3 className="text-lg font-medium mb-4">{SLOT_LABELS[slot]}</h3>
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
                          "border rounded-lg overflow-hidden transition-all bg-card",
                          itemFeedback.is_favorite
                            ? "border-red-400 ring-1 ring-red-400/30"
                            : "border-border"
                        )}
                      >
                        <div className="relative aspect-square">
                          <img
                            src={item.stored_url}
                            alt=""
                            className="w-full h-full object-contain bg-muted"
                          />
                          <button
                            onClick={() => toggleFavorite(item.id)}
                            className={cn(
                              "absolute top-3 right-3 p-2.5 rounded-full transition-all",
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
                            className="min-h-[60px] text-sm resize-none"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </main>
      </div>
    );
  }

  // Main tile grid view
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/external/talent-replacement')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-medium">{reviewName}</h1>
              <p className="text-sm text-muted-foreground">
                Click a look to review and select your favorites
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {getFavoriteCount()} favorite(s)
            </span>
            <Button onClick={handleSubmitFeedback} disabled={isSubmitting}>
              <Send className="h-4 w-4 mr-2" />
              {isSubmitting
                ? "Submitting..."
                : hasSubmitted
                  ? "Update Feedback"
                  : "Submit Feedback"}
            </Button>
          </div>
        </div>
      </header>

      <main className="p-6">
        {lookIds.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No looks found in this review
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {lookIds.map((lookId) => {
              const lookInfo = lookInfoMap[lookId];
              const thumbnails = getLookThumbnails(lookId);
              const favoriteCount = getFavoriteCountForLook(lookId);
              const commentCount = getCommentCountForLook(lookId);

              return (
                <Card
                  key={lookId}
                  className="overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all group"
                  onClick={() => setSelectedLookId(lookId)}
                >
                  {/* Thumbnail grid */}
                  <div className="aspect-square relative bg-muted">
                    <div className="grid grid-cols-2 gap-0.5 h-full">
                      {thumbnails.map((url, idx) => (
                        <div
                          key={idx}
                          className="relative overflow-hidden"
                        >
                          <img
                            src={url}
                            alt=""
                            className="w-full h-full object-contain bg-muted group-hover:scale-105 transition-transform duration-300"
                          />
                        </div>
                      ))}
                      {/* Fill empty slots */}
                      {Array.from({ length: 4 - thumbnails.length }).map(
                        (_, idx) => (
                          <div
                            key={`empty-${idx}`}
                            className="bg-muted-foreground/10"
                          />
                        )
                      )}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <h3 className="font-medium truncate">
                      {lookInfo?.name || `Look ${lookId.slice(0, 8)}`}
                    </h3>
                    {lookInfo && (
                      <p className="text-sm text-muted-foreground truncate">
                        {lookInfo.talent_name}
                      </p>
                    )}

                    {/* Status badges */}
                    <div className="flex items-center gap-3 mt-3">
                      {favoriteCount > 0 && (
                        <div className="flex items-center gap-1 text-sm text-red-500">
                          <Heart className="h-4 w-4 fill-current" />
                          <span>{favoriteCount}</span>
                        </div>
                      )}
                      {commentCount > 0 && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MessageSquare className="h-4 w-4" />
                          <span>{commentCount}</span>
                        </div>
                      )}
                      {favoriteCount === 0 && commentCount === 0 && (
                        <span className="text-xs text-muted-foreground">
                          Pending review
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
