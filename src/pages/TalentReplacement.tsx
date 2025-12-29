import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MessageSquare, Heart } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface ReviewWithDetails {
  id: string;
  name: string;
  status: string;
  created_at: string;
  project_name: string | null;
  item_count: number;
  look_count: number;
  thumbnail_urls: string[];
  feedback_count: number;
  favorite_count: number;
}

export default function TalentReplacement() {
  const navigate = useNavigate();
  const [reviews, setReviews] = useState<ReviewWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchReviews();
  }, []);

  const fetchReviews = async () => {
    try {
      // Fetch reviews that have a project_id (linked to external projects)
      const { data: reviewsData, error: reviewsError } = await supabase
        .from("client_reviews")
        .select(`
          id,
          name,
          status,
          created_at,
          project_id
        `)
        .not("project_id", "is", null)
        .order("created_at", { ascending: false });

      if (reviewsError) throw reviewsError;

      // Get details for each review
      const reviewsWithDetails = await Promise.all(
        (reviewsData || []).map(async (review) => {
          // Get project name
          let projectName = null;
          if (review.project_id) {
            const { data: project } = await supabase
              .from("external_projects")
              .select("name")
              .eq("id", review.project_id)
              .maybeSingle();
            projectName = project?.name || null;
          }

          // Get items with generation URLs
          const { data: items } = await supabase
            .from("client_review_items")
            .select("id, generation_id, look_id")
            .eq("review_id", review.id);

          // Get unique looks
          const uniqueLooks = new Set((items || []).map((i) => i.look_id).filter(Boolean));

          // Get thumbnail URLs from generations
          const generationIds = (items || []).slice(0, 4).map((i) => i.generation_id);
          let thumbnailUrls: string[] = [];
          if (generationIds.length > 0) {
            const { data: generations } = await supabase
              .from("generations")
              .select("stored_url")
              .in("id", generationIds);
            thumbnailUrls = (generations || []).map((g) => g.stored_url);
          }

          // Get feedback counts
          const { data: feedback } = await supabase
            .from("client_review_feedback")
            .select("id, is_favorite")
            .eq("review_id", review.id);

          const feedbackCount = (feedback || []).filter((f) => f.id).length;
          const favoriteCount = (feedback || []).filter((f) => f.is_favorite).length;

          return {
            id: review.id,
            name: review.name,
            status: review.status,
            created_at: review.created_at,
            project_name: projectName,
            item_count: items?.length || 0,
            look_count: uniqueLooks.size,
            thumbnail_urls: thumbnailUrls,
            feedback_count: feedbackCount,
            favorite_count: favoriteCount,
          };
        })
      );

      setReviews(reviewsWithDetails);
    } catch (error) {
      console.error("Error fetching reviews:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="secondary">Draft</Badge>;
      case "sent":
        return <Badge variant="outline">Pending Review</Badge>;
      case "reviewed":
        return <Badge className="bg-green-600">Reviewed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/external")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Talent Replacement</h1>
              <p className="text-sm text-muted-foreground">
                Review curated image selections
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 py-8">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64 rounded-xl" />
            ))}
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground text-lg">
              No reviews available yet
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Reviews will appear here once they are sent for client review
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {reviews.map((review) => (
              <Card
                key={review.id}
                className="overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                onClick={() => navigate(`/review/${review.id}`)}
              >
                {/* Thumbnail Grid */}
                <div className="aspect-video bg-muted grid grid-cols-2 gap-0.5 overflow-hidden">
                  {review.thumbnail_urls.slice(0, 4).map((url, idx) => (
                    <div
                      key={idx}
                      className="bg-muted-foreground/10 overflow-hidden"
                    >
                      <img
                        src={url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                  {review.thumbnail_urls.length === 0 &&
                    [1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="bg-muted-foreground/10"
                      />
                    ))}
                </div>

                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-semibold text-lg leading-tight">
                      {review.name}
                    </h3>
                    {getStatusBadge(review.status)}
                  </div>

                  {review.project_name && (
                    <p className="text-sm text-muted-foreground mb-2">
                      {review.project_name}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{review.look_count} looks</span>
                    <span>{review.item_count} images</span>
                  </div>

                  <div className="flex items-center gap-4 mt-3 text-sm">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Heart className="h-4 w-4" />
                      <span>{review.favorite_count}</span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <MessageSquare className="h-4 w-4" />
                      <span>{review.feedback_count}</span>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground mt-3">
                    Created {new Date(review.created_at).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
