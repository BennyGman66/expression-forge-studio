

## Plan: Server-Side Render Queue for Expression Map Generation

### Problem

Currently, expression map image generation runs as a **client-side sequential loop** — the frontend calls `generate-images` one prompt at a time, blocking the browser tab. If the tab closes, generation stops. The uploaded `RENDER_QUEUE_SYSTEM.md` describes a robust server-side queue pattern that eliminates this dependency.

### Approach

Adapt the uploaded queue architecture for the expression map context. The expression map is simpler than the repose system (single image input + text prompt, no clay poses), so we'll take the core patterns — `pg_cron`-driven worker, `FOR UPDATE SKIP LOCKED` claiming, auto-retry, cancellation — and apply them to the existing `outputs` + `jobs` tables.

### What Changes

**1. New Database Table: `expression_render_queue`**

```sql
CREATE TABLE public.expression_render_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id),
  project_id uuid NOT NULL,
  digital_model_id uuid NOT NULL,
  recipe_id uuid NOT NULL,
  prompt text NOT NULL,
  model_ref_url text NOT NULL,
  ai_model text NOT NULL DEFAULT 'google/gemini-3-pro-image-preview',
  status text DEFAULT 'pending',
  attempts integer DEFAULT 0,
  max_attempts integer DEFAULT 3,
  error_message text,
  output_id uuid,
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);
```

Plus two database functions:
- `claim_expression_queue_items(batch_size)` — atomic claim with `FOR UPDATE SKIP LOCKED`
- `recover_stale_expression_queue_items()` — recover items stuck in `processing` for >5 min

**2. New Edge Function: `process-expression-queue`**

A worker function that:
- Recovers stale items
- Claims 1 item atomically
- Calls Lovable AI Gateway (same as current `generate-images`)
- Uploads result to storage
- Inserts into `outputs` table
- Updates queue item status

Triggered by `pg_cron` every minute (two staggered jobs for ~2 items/min throughput). Uses `verify_jwt = false` since it's called by cron.

**3. Modified `ProjectWorkspace.tsx` — `processGenerationPrompts`**

Instead of the current client-side loop that calls the edge function sequentially, it will:
1. Create a job record (same as now)
2. Bulk-insert all prompts into `expression_render_queue`
3. Return immediately — no blocking loop

**4. New Hook: `useExpressionQueueProgress`**

Polls `expression_render_queue` for counts (`pending`, `processing`, `completed`, `failed`) scoped to the current job. Uses `react-query` with 5s `refetchInterval` when active.

**5. Updated `GenerationProgress.tsx`**

Replace the current job-polling progress display with one driven by queue counts. Add cancel button that sets pending items to `cancelled`.

### What Stays the Same

- `outputs` table — results still land here
- `jobs` table — still used as the parent job record
- `GeneratePanel.tsx` — UI for selecting models/recipes unchanged
- `ReviewPanel.tsx` — reads from `outputs`, unchanged
- `generate-images` edge function — kept for backwards compatibility but no longer called in a loop
- All prompt building logic (`buildFullPrompt`, recipes, etc.)

### Technical Details

```text
┌─────────────┐     INSERT rows     ┌──────────────────────────┐
│  Frontend    │ ──────────────────► │  expression_render_queue  │
│  (one call)  │                    │  (status: pending)        │
└─────────────┘                    └──────────────────────────┘
                                              │
                                    pg_cron every 60s
                                              ▼
                                   ┌──────────────────────────┐
                                   │  process-expression-queue │
                                   │  - claim 1 item (SKIP     │
                                   │    LOCKED)                 │
                                   │  - call AI gateway         │
                                   │  - upload to storage       │
                                   │  - insert into outputs     │
                                   │  - mark completed/failed   │
                                   └──────────────────────────┘
                                              │
                                    Realtime / polling
                                              ▼
                                   ┌──────────────────────────┐
                                   │  Frontend progress bar    │
                                   │  (useExpressionQueue      │
                                   │   Progress hook)          │
                                   └──────────────────────────┘
```

### Files to Create
- `supabase/functions/process-expression-queue/index.ts` — worker edge function
- `src/hooks/useExpressionQueueProgress.ts` — client-side progress tracking hook

### Files to Modify
- `src/components/expression-map/ProjectWorkspace.tsx` — replace loop with queue insert
- `src/components/steps/GenerationProgress.tsx` — use queue-based progress
- Database migration for new table + functions + cron jobs

### Risk Mitigation
- Existing `outputs` table and `ReviewPanel` are untouched — no breakage to review workflow
- The `generate-images` edge function is kept intact for any other uses
- Queue items reference the same `job_id` so existing job status display still works
- Cancel sets items to `cancelled` and checks status mid-processing (ghost prevention from the uploaded doc)

