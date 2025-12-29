import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { HubHeader } from "@/components/layout/HubHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Copy, Trash2, Eye, ExternalLink, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ReviewCurationPanel } from "@/components/external/ReviewCurationPanel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ClientReview {
  id: string;
  name: string;
  status: string;
  generation_job_id: string | null;
  created_at: string;
  updated_at: string;
  feedback_count?: number;
}

export default function External() {
  const navigate = useNavigate();
  const [reviews, setReviews] = useState<ClientReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCuration, setShowCuration] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reviewToDelete, setReviewToDelete] = useState<string | null>(null);

  useEffect(() => {
    fetchReviews();
  }, []);

  const fetchReviews = async () => {
    setIsLoading(true);
    try {
      // Fetch reviews with feedback count
      const { data: reviewsData, error: reviewsError } = await supabase
        .from("client_reviews")
        .select("*")
        .order("created_at", { ascending: false });

      if (reviewsError) throw reviewsError;

      // Fetch feedback counts for each review
      const reviewsWithCounts = await Promise.all(
        (reviewsData || []).map(async (review) => {
          const { count } = await supabase
            .from("client_review_feedback")
            .select("*", { count: "exact", head: true })
            .eq("review_id", review.id)
            .not("comment", "is", null);
          
          return {
            ...review,
            feedback_count: count || 0,
          };
        })
      );

      setReviews(reviewsWithCounts);
    } catch (error) {
      console.error("Error fetching reviews:", error);
      toast({
        title: "Error",
        description: "Failed to load reviews",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = (reviewId: string) => {
    const url = `${window.location.origin}/review/${reviewId}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link copied",
      description: "Review link copied to clipboard",
    });
  };

  const handleDeleteReview = async () => {
    if (!reviewToDelete) return;

    try {
      const { error } = await supabase
        .from("client_reviews")
        .delete()
        .eq("id", reviewToDelete);

      if (error) throw error;

      setReviews(reviews.filter((r) => r.id !== reviewToDelete));
      toast({
        title: "Review deleted",
        description: "The review has been deleted",
      });
    } catch (error) {
      console.error("Error deleting review:", error);
      toast({
        title: "Error",
        description: "Failed to delete review",
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setReviewToDelete(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="secondary">Draft</Badge>;
      case "sent":
        return <Badge variant="default">Sent</Badge>;
      case "reviewed":
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Reviewed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (showCuration) {
    return (
      <ReviewCurationPanel
        onBack={() => {
          setShowCuration(false);
          fetchReviews();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <HubHeader />

      <main className="px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl">External Reviews</h1>
              <p className="text-muted-foreground mt-1">
                Share curated selections with clients for review
              </p>
            </div>
          </div>
          <Button onClick={() => setShowCuration(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Review
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            Loading reviews...
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No reviews yet</p>
            <Button onClick={() => setShowCuration(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create your first review
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reviews.map((review) => (
              <Card key={review.id} className="flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{review.name}</CardTitle>
                    {getStatusBadge(review.status)}
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>
                      Created:{" "}
                      {new Date(review.created_at).toLocaleDateString()}
                    </p>
                    {review.feedback_count ? (
                      <p className="text-foreground">
                        {review.feedback_count} feedback item(s)
                      </p>
                    ) : null}
                  </div>
                </CardContent>
                <CardFooter className="pt-2 gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyLink(review.id)}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    Copy Link
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`/review/${review.id}`, "_blank")}
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    Preview
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setReviewToDelete(review.id);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </main>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Review</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this review? This action cannot be
              undone and all client feedback will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteReview}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
