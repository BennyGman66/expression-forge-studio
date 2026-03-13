import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    console.error("LOVABLE_API_KEY not configured");
    return new Response(JSON.stringify({ error: "Not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Step 1: Recover stale items
    const { data: recoveredCount } = await supabase.rpc("recover_stale_expression_queue_items");
    if (recoveredCount && recoveredCount > 0) {
      console.log(`Recovered ${recoveredCount} stale queue items`);
    }

    // Step 2: Claim one item atomically
    const { data: claimed, error: claimError } = await supabase.rpc("claim_expression_queue_items", {
      p_batch_size: 1,
    });

    if (claimError) {
      console.error("Claim error:", claimError);
      return new Response(JSON.stringify({ error: "Claim failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!claimed || claimed.length === 0) {
      return new Response(JSON.stringify({ message: "No items to process" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const item = claimed[0];
    console.log(`Processing queue item ${item.id} for job ${item.job_id} (attempt ${item.attempts})`);

    // Step 3: Check if job is still active (ghost prevention)
    const { data: job } = await supabase
      .from("jobs")
      .select("status")
      .eq("id", item.job_id)
      .single();

    if (!job || job.status === "stopped" || job.status === "cancelled") {
      console.log(`Job ${item.job_id} is ${job?.status || "missing"}, skipping`);
      await supabase
        .from("expression_render_queue")
        .update({ status: "cancelled", completed_at: new Date().toISOString() })
        .eq("id", item.id);

      return new Response(JSON.stringify({ message: "Job cancelled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 4: Call AI Gateway
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: item.ai_model,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: item.prompt },
                { type: "image_url", image_url: { url: item.model_ref_url } },
              ],
            },
          ],
          modalities: ["image", "text"],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`AI Gateway error: ${response.status}`, errorText);

        if (response.status === 429) {
          // Rate limited - exponential backoff
          const backoffSeconds = Math.min(60 * Math.pow(2, item.attempts - 1), 3600);
          const retryAfter = new Date(Date.now() + backoffSeconds * 1000).toISOString();

          await supabase
            .from("expression_render_queue")
            .update({
              status: "pending",
              retry_after: retryAfter,
              error_message: `Rate limited, retry after ${backoffSeconds}s`,
            })
            .eq("id", item.id);

          return new Response(JSON.stringify({ rateLimited: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (response.status === 402) {
          // Credits exhausted - fail item and stop job
          await supabase
            .from("expression_render_queue")
            .update({
              status: "failed",
              error_message: "Credits exhausted",
              completed_at: new Date().toISOString(),
            })
            .eq("id", item.id);

          // Cancel all remaining pending items for this job
          await supabase
            .from("expression_render_queue")
            .update({ status: "cancelled", completed_at: new Date().toISOString() })
            .eq("job_id", item.job_id)
            .eq("status", "pending");

          await supabase
            .from("jobs")
            .update({ status: "failed", updated_at: new Date().toISOString() })
            .eq("id", item.job_id);

          return new Response(JSON.stringify({ creditsExhausted: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Other errors - mark for retry or fail
        const shouldRetry = item.attempts < item.max_attempts;
        await supabase
          .from("expression_render_queue")
          .update({
            status: shouldRetry ? "pending" : "failed",
            error_message: `HTTP ${response.status}: ${errorText.substring(0, 200)}`,
            retry_after: shouldRetry
              ? new Date(Date.now() + 10000 * item.attempts).toISOString()
              : null,
            completed_at: shouldRetry ? null : new Date().toISOString(),
          })
          .eq("id", item.id);

        return new Response(JSON.stringify({ error: `HTTP ${response.status}` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      const imageData = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

      if (!imageData) {
        console.error("No image returned from AI");
        const shouldRetry = item.attempts < item.max_attempts;
        await supabase
          .from("expression_render_queue")
          .update({
            status: shouldRetry ? "pending" : "failed",
            error_message: "No image in response",
            completed_at: shouldRetry ? null : new Date().toISOString(),
          })
          .eq("id", item.id);

        return new Response(JSON.stringify({ error: "No image returned" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Step 5: Upload to storage
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
      const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
      const fileName = `projects/${item.project_id}/outputs/${Date.now()}-${Math.random().toString(36).substring(7)}.png`;

      const { error: uploadError } = await supabase.storage.from("images").upload(fileName, imageBytes, {
        contentType: "image/png",
        upsert: false,
      });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        const shouldRetry = item.attempts < item.max_attempts;
        await supabase
          .from("expression_render_queue")
          .update({
            status: shouldRetry ? "pending" : "failed",
            error_message: `Upload failed: ${uploadError.message}`,
            completed_at: shouldRetry ? null : new Date().toISOString(),
          })
          .eq("id", item.id);

        return new Response(JSON.stringify({ error: "Upload failed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("images").getPublicUrl(fileName);

      // Step 6: Insert into outputs table
      const { data: output, error: outputError } = await supabase
        .from("outputs")
        .insert({
          project_id: item.project_id,
          digital_model_id: item.digital_model_id,
          recipe_id: item.recipe_id,
          prompt_used: item.prompt,
          image_url: publicUrl,
          status: "completed",
        })
        .select("id")
        .single();

      if (outputError) {
        console.error("Output insert error:", outputError);
      }

      // Step 7: Mark queue item completed
      await supabase
        .from("expression_render_queue")
        .update({
          status: "completed",
          output_id: output?.id || null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      // Step 8: Update job progress
      const { count: completedCount } = await supabase
        .from("expression_render_queue")
        .select("*", { count: "exact", head: true })
        .eq("job_id", item.job_id)
        .in("status", ["completed", "failed", "cancelled"]);

      const { count: totalCount } = await supabase
        .from("expression_render_queue")
        .select("*", { count: "exact", head: true })
        .eq("job_id", item.job_id);

      await supabase
        .from("jobs")
        .update({
          progress: completedCount || 0,
          total: totalCount || 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.job_id);

      // Check if all items are done
      const { count: pendingCount } = await supabase
        .from("expression_render_queue")
        .select("*", { count: "exact", head: true })
        .eq("job_id", item.job_id)
        .in("status", ["pending", "processing"]);

      if (pendingCount === 0) {
        await supabase
          .from("jobs")
          .update({ status: "completed", updated_at: new Date().toISOString() })
          .eq("id", item.job_id);
        console.log(`Job ${item.job_id} completed`);
      }

      console.log(`Queue item ${item.id} completed successfully`);
      return new Response(JSON.stringify({ success: true, outputId: output?.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      const isTimeout = err instanceof Error && err.name === "AbortError";
      console.error(`Processing error:`, errorMessage);

      const shouldRetry = item.attempts < item.max_attempts;
      await supabase
        .from("expression_render_queue")
        .update({
          status: shouldRetry ? "pending" : "failed",
          error_message: isTimeout ? "Request timed out" : errorMessage.substring(0, 500),
          retry_after: shouldRetry
            ? new Date(Date.now() + 15000 * item.attempts).toISOString()
            : null,
          completed_at: shouldRetry ? null : new Date().toISOString(),
        })
        .eq("id", item.id);

      return new Response(JSON.stringify({ error: errorMessage }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("Queue processor error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
