import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { 
  JobSubmission, 
  SubmissionAsset, 
  ReviewThread, 
  ReviewComment, 
  ImageAnnotation,
  Notification,
  SubmissionStatus,
  CommentVisibility,
  AnnotationRect,
  ThreadScope,
  AssetReviewStatus
} from '@/types/review';

// ============ SUBMISSIONS ============

export function useJobSubmissions(jobId: string | null) {
  return useQuery({
    queryKey: ['job-submissions', jobId],
    queryFn: async () => {
      if (!jobId) return [];
      const { data, error } = await supabase
        .from('job_submissions')
        .select(`
          *,
          submitted_by:users!job_submissions_submitted_by_user_id_fkey(id, display_name, email)
        `)
        .eq('job_id', jobId)
        .order('version_number', { ascending: false });
      
      if (error) throw error;
      return data as JobSubmission[];
    },
    enabled: !!jobId,
  });
}

export function useLatestSubmission(jobId: string | null) {
  return useQuery({
    queryKey: ['latest-submission', jobId],
    queryFn: async () => {
      if (!jobId) return null;
      const { data, error } = await supabase
        .from('job_submissions')
        .select(`
          *,
          submitted_by:users!job_submissions_submitted_by_user_id_fkey(id, display_name, email)
        `)
        .eq('job_id', jobId)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data as JobSubmission | null;
    },
    enabled: !!jobId,
  });
}

export function useCreateSubmission() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      jobId, 
      assets,
      summaryNote
    }: { 
      jobId: string; 
      assets: { fileUrl: string; label: string; sortIndex: number }[];
      summaryNote?: string;
    }) => {
      // Get current max version
      const { data: existing } = await supabase
        .from('job_submissions')
        .select('version_number')
        .eq('job_id', jobId)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      const nextVersion = (existing?.version_number || 0) + 1;
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      // Create submission
      const { data: submission, error: subError } = await supabase
        .from('job_submissions')
        .insert({
          job_id: jobId,
          submitted_by_user_id: user?.id,
          version_number: nextVersion,
          summary_note: summaryNote,
          status: 'SUBMITTED' as SubmissionStatus,
        })
        .select()
        .single();
      
      if (subError) throw subError;
      
      // Create assets
      if (assets.length > 0) {
        const { error: assetError } = await supabase
          .from('submission_assets')
          .insert(assets.map(a => ({
            submission_id: submission.id,
            file_url: a.fileUrl,
            label: a.label,
            sort_index: a.sortIndex,
          })));
        
        if (assetError) throw assetError;
      }
      
      // Update job status to SUBMITTED
      await supabase
        .from('unified_jobs')
        .update({ status: 'SUBMITTED' })
        .eq('id', jobId);
      
      return submission;
    },
    onSuccess: (_, { jobId }) => {
      queryClient.invalidateQueries({ queryKey: ['job-submissions', jobId] });
      queryClient.invalidateQueries({ queryKey: ['latest-submission', jobId] });
      queryClient.invalidateQueries({ queryKey: ['unified-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['unified-job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs-review-progress'] });
    },
  });
}

export function useUpdateSubmissionStatus() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      submissionId, 
      status,
      jobId
    }: { 
      submissionId: string; 
      status: SubmissionStatus;
      jobId: string;
    }) => {
      const { error } = await supabase
        .from('job_submissions')
        .update({ status })
        .eq('id', submissionId);
      
      if (error) throw error;
      
      // Also update job status accordingly
      type JobStatusType = 'SUBMITTED' | 'NEEDS_CHANGES' | 'APPROVED';
      let jobStatus: JobStatusType = 'SUBMITTED';
      if (status === 'IN_REVIEW') jobStatus = 'SUBMITTED';
      if (status === 'CHANGES_REQUESTED') jobStatus = 'NEEDS_CHANGES';
      if (status === 'APPROVED') jobStatus = 'APPROVED';
      
      await supabase
        .from('unified_jobs')
        .update({ status: jobStatus })
        .eq('id', jobId);
    },
    onSuccess: (_, { jobId }) => {
      queryClient.invalidateQueries({ queryKey: ['job-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['latest-submission'] });
      queryClient.invalidateQueries({ queryKey: ['unified-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['unified-job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs-review-progress'] });
    },
  });
}

// ============ ASSETS ============

export function useSubmissionAssets(submissionId: string | null) {
  return useQuery({
    queryKey: ['submission-assets', submissionId],
    queryFn: async () => {
      if (!submissionId) return [];
      // Only fetch current (non-superseded) assets
      const { data, error } = await supabase
        .from('submission_assets')
        .select('*, review_status, reviewed_by_user_id, reviewed_at')
        .eq('submission_id', submissionId)
        .is('superseded_by', null) // Asset-centric: only show current versions
        .order('sort_index');
      
      if (error) throw error;
      return data as SubmissionAsset[];
    },
    enabled: !!submissionId,
  });
}

// Asset slot with current version and history
export interface AssetSlot {
  slotKey: string;
  current: SubmissionAsset;
  history: SubmissionAsset[];
}

// Asset-centric: Get all assets for a job grouped by slot with version history
export function useJobAssetsWithHistory(jobId: string | null) {
  return useQuery({
    queryKey: ['job-assets-with-history', jobId],
    queryFn: async () => {
      if (!jobId) return [];
      
      // Get all submissions for this job
      const { data: submissions, error: subError } = await supabase
        .from('job_submissions')
        .select('id')
        .eq('job_id', jobId);
      
      if (subError) throw subError;
      if (!submissions?.length) return [];
      
      // Get ALL assets (including superseded) for these submissions
      const { data: allAssets, error: assetsError } = await supabase
        .from('submission_assets')
        .select('*, review_status, reviewed_by_user_id, reviewed_at, superseded_by, revision_number')
        .in('submission_id', submissions.map(s => s.id))
        .order('sort_index')
        .order('revision_number', { ascending: false });
      
      if (assetsError) throw assetsError;
      if (!allAssets?.length) return [];
      
      // Group by label/sort_index to identify asset "slots"
      // Current version = superseded_by is null
      // Historical versions = superseded_by is not null (ordered by revision descending)
      const slotMap = new Map<string, { current: SubmissionAsset | null; history: SubmissionAsset[] }>();
      
      for (const asset of allAssets) {
        // Use label as slot key, fallback to sort_index
        const slotKey = asset.label || `slot-${asset.sort_index}`;
        
        if (!slotMap.has(slotKey)) {
          slotMap.set(slotKey, { current: null, history: [] });
        }
        
        const slot = slotMap.get(slotKey)!;
        
        if (asset.superseded_by === null) {
          // This is the current version
          slot.current = asset as SubmissionAsset;
        } else {
          // This is a historical version
          slot.history.push(asset as SubmissionAsset);
        }
      }
      
      // Convert to array, filter out slots without a current version
      const result: AssetSlot[] = [];
      for (const [slotKey, slot] of slotMap.entries()) {
        if (slot.current) {
          // Sort history by revision_number descending
          slot.history.sort((a, b) => (b.revision_number || 1) - (a.revision_number || 1));
          result.push({
            slotKey,
            current: slot.current,
            history: slot.history,
          });
        }
      }
      
      // Sort by sort_index of current asset
      result.sort((a, b) => a.current.sort_index - b.current.sort_index);
      
      return result;
    },
    enabled: !!jobId,
  });
}

// ============ PER-ASSET REVIEW ============

export function useUpdateAssetStatus() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      assetId, 
      status,
      submissionId,
      jobId
    }: { 
      assetId: string; 
      status: 'APPROVED' | 'CHANGES_REQUESTED';
      submissionId: string;
      jobId: string;
    }) => {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      // Update the individual asset
      const { error: assetError } = await supabase
        .from('submission_assets')
        .update({ 
          review_status: status,
          reviewed_by_user_id: user?.id,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', assetId);
      
      if (assetError) throw assetError;
      
      // Fetch only CURRENT assets (not superseded) to determine aggregate status
      const { data: allAssets, error: fetchError } = await supabase
        .from('submission_assets')
        .select('review_status')
        .eq('submission_id', submissionId)
        .is('superseded_by', null);
      
      if (fetchError) throw fetchError;
      
      // Calculate aggregate status
      const statuses = allAssets.map(a => a.review_status);
      const anyChangesRequested = statuses.some(s => s === 'CHANGES_REQUESTED');
      const allApproved = statuses.every(s => s === 'APPROVED');
      
      let submissionStatus: SubmissionStatus = 'IN_REVIEW';
      let jobStatus: 'SUBMITTED' | 'NEEDS_CHANGES' | 'APPROVED' = 'SUBMITTED';
      
      if (anyChangesRequested) {
        submissionStatus = 'CHANGES_REQUESTED';
        jobStatus = 'NEEDS_CHANGES';
      } else if (allApproved) {
        submissionStatus = 'APPROVED';
        jobStatus = 'APPROVED';
      }
      
      // Update submission status
      await supabase
        .from('job_submissions')
        .update({ status: submissionStatus })
        .eq('id', submissionId);
      
      // Update job status
      await supabase
        .from('unified_jobs')
        .update({ status: jobStatus })
        .eq('id', jobId);
      
      return { allApproved, anyChangesRequested };
    },
    onSuccess: (_, { submissionId, jobId }) => {
      queryClient.invalidateQueries({ queryKey: ['submission-assets', submissionId] });
      queryClient.invalidateQueries({ queryKey: ['job-assets-with-history', jobId] });
      queryClient.invalidateQueries({ queryKey: ['job-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['latest-submission'] });
      queryClient.invalidateQueries({ queryKey: ['unified-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['unified-job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs-review-progress'] });
    },
  });
}

// ============ THREADS & COMMENTS ============

export function useReviewThreads(submissionId: string | null) {
  return useQuery({
    queryKey: ['review-threads', submissionId],
    queryFn: async () => {
      if (!submissionId) return [];
      const { data, error } = await supabase
        .from('review_threads')
        .select(`
          *,
          comments:review_comments(
            *,
            author:users!review_comments_author_user_id_fkey(id, display_name, email)
          )
        `)
        .eq('submission_id', submissionId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data as ReviewThread[];
    },
    enabled: !!submissionId,
  });
}

export function useThreadComments(threadId: string | null) {
  return useQuery({
    queryKey: ['thread-comments', threadId],
    queryFn: async () => {
      if (!threadId) return [];
      const { data, error } = await supabase
        .from('review_comments')
        .select(`
          *,
          author:users!review_comments_author_user_id_fkey(id, display_name, email)
        `)
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data as ReviewComment[];
    },
    enabled: !!threadId,
  });
}

export function useCreateThread() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      submissionId,
      scope,
      assetId,
      annotationId,
    }: {
      submissionId: string;
      scope: ThreadScope;
      assetId?: string;
      annotationId?: string;
    }) => {
      const { data, error } = await supabase
        .from('review_threads')
        .insert({
          submission_id: submissionId,
          scope,
          asset_id: assetId,
          annotation_id: annotationId,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data as ReviewThread;
    },
    onSuccess: (_, { submissionId }) => {
      queryClient.invalidateQueries({ queryKey: ['review-threads', submissionId] });
    },
  });
}

export function useAddComment() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      threadId,
      body,
      visibility = 'SHARED',
    }: {
      threadId: string;
      body: string;
      visibility?: CommentVisibility;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('review_comments')
        .insert({
          thread_id: threadId,
          author_user_id: user?.id,
          body,
          visibility,
        })
        .select(`
          *,
          author:users!review_comments_author_user_id_fkey(id, display_name, email)
        `)
        .single();
      
      if (error) throw error;
      return data as ReviewComment;
    },
    onSuccess: (_, { threadId }) => {
      queryClient.invalidateQueries({ queryKey: ['thread-comments', threadId] });
      queryClient.invalidateQueries({ queryKey: ['review-threads'] });
    },
  });
}

// ============ ANNOTATIONS ============

export function useAssetAnnotations(assetId: string | null) {
  return useQuery({
    queryKey: ['asset-annotations', assetId],
    queryFn: async () => {
      if (!assetId) return [];
      const { data, error } = await supabase
        .from('image_annotations')
        .select(`
          *,
          created_by:users!image_annotations_created_by_user_id_fkey(id, display_name, email)
        `)
        .eq('asset_id', assetId)
        .order('created_at');
      
      if (error) throw error;
      
      // Parse rect and style from JSON
      return data.map(a => ({
        ...a,
        rect: a.rect as unknown as AnnotationRect,
        style: a.style as unknown as { rounded: boolean },
      })) as ImageAnnotation[];
    },
    enabled: !!assetId,
  });
}

export function useCreateAnnotation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      assetId,
      rect,
      submissionId,
    }: {
      assetId: string;
      rect: AnnotationRect;
      submissionId: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Create annotation
      const { data: annotation, error: annError } = await supabase
        .from('image_annotations')
        .insert([{
          asset_id: assetId,
          created_by_user_id: user?.id,
          rect: JSON.parse(JSON.stringify(rect)) as Json,
          style: { rounded: true } as Json,
        }])
        .select()
        .single();
      
      if (annError) throw annError;
      
      // Create thread for this annotation
      const { data: thread, error: threadError } = await supabase
        .from('review_threads')
        .insert({
          submission_id: submissionId,
          scope: 'ANNOTATION',
          asset_id: assetId,
          annotation_id: annotation.id,
        })
        .select()
        .single();
      
      if (threadError) throw threadError;
      
      return { annotation, thread };
    },
    onSuccess: (_, { assetId, submissionId }) => {
      queryClient.invalidateQueries({ queryKey: ['asset-annotations', assetId] });
      queryClient.invalidateQueries({ queryKey: ['review-threads', submissionId] });
    },
  });
}

export function useDeleteAnnotation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ annotationId }: { annotationId: string }) => {
      const { error } = await supabase
        .from('image_annotations')
        .delete()
        .eq('id', annotationId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-annotations'] });
      queryClient.invalidateQueries({ queryKey: ['review-threads'] });
    },
  });
}

// ============ NOTIFICATIONS ============

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as Notification[];
    },
  });
}

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: ['unread-notification-count'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;
      
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('read_at', null);
      
      if (error) throw error;
      return count || 0;
    },
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ notificationId }: { notificationId: string }) => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-notification-count'] });
    },
  });
}

export function useCreateNotification() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      userId,
      type,
      jobId,
      submissionId,
      commentId,
      metadata,
    }: {
      userId: string;
      type: Notification['type'];
      jobId?: string;
      submissionId?: string;
      commentId?: string;
      metadata?: Record<string, unknown>;
    }) => {
      const insertData = {
        user_id: userId,
        type,
        metadata: (metadata || {}) as Json,
        job_id: jobId,
        submission_id: submissionId,
        comment_id: commentId,
      };
      
      const { data, error } = await supabase
        .from('notifications')
        .insert([insertData])
        .select()
        .single();
      
      if (error) throw error;
      return data as Notification;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-notification-count'] });
    },
  });
}

// ============ RESUBMISSION WITH REPLACEMENTS ============
// New asset-centric model: replaces assets in-place using superseded_by

export function useCreateResubmission() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      jobId,
      previousSubmissionId,
      replacements,
    }: {
      jobId: string;
      previousSubmissionId: string;
      replacements: Map<string, string>; // assetId -> new file URL
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // For each replacement, create a new asset and mark the old one as superseded
      for (const [oldAssetId, newFileUrl] of replacements) {
        // Get the old asset details
        const { data: oldAsset, error: fetchError } = await supabase
          .from('submission_assets')
          .select('*')
          .eq('id', oldAssetId)
          .single();
        
        if (fetchError) throw fetchError;
        
        // Create new asset with incremented revision number
        const { data: newAsset, error: insertError } = await supabase
          .from('submission_assets')
          .insert({
            submission_id: previousSubmissionId, // Same submission - asset-centric, not version-centric
            file_url: newFileUrl,
            label: oldAsset.label,
            sort_index: oldAsset.sort_index,
            revision_number: (oldAsset.revision_number || 1) + 1,
            review_status: null, // New asset needs review
            reviewed_by_user_id: null,
            reviewed_at: null,
          })
          .select()
          .single();
        
        if (insertError) throw insertError;
        
        // Mark old asset as superseded
        const { error: updateError } = await supabase
          .from('submission_assets')
          .update({ superseded_by: newAsset.id })
          .eq('id', oldAssetId);
        
        if (updateError) throw updateError;
      }
      
      // Update submission status back to SUBMITTED
      await supabase
        .from('job_submissions')
        .update({ 
          status: 'SUBMITTED' as SubmissionStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', previousSubmissionId);
      
      // Update job status to SUBMITTED
      await supabase
        .from('unified_jobs')
        .update({ status: 'SUBMITTED' })
        .eq('id', jobId);
      
      return { id: previousSubmissionId };
    },
    onSuccess: (_, { jobId, previousSubmissionId }) => {
      queryClient.invalidateQueries({ queryKey: ['job-submissions', jobId] });
      queryClient.invalidateQueries({ queryKey: ['latest-submission', jobId] });
      queryClient.invalidateQueries({ queryKey: ['submission-assets', previousSubmissionId] });
      queryClient.invalidateQueries({ queryKey: ['unified-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['unified-job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs-review-progress'] });
    },
  });
}

// ============ REVIEW COUNTS FOR JOB BOARD ============

export function useNeedsReviewCount() {
  return useQuery({
    queryKey: ['needs-review-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('unified_jobs')
        .select('*', { count: 'exact', head: true })
        .in('status', ['SUBMITTED', 'NEEDS_CHANGES']);
      
      if (error) throw error;
      return count || 0;
    },
  });
}

export function useJobsNeedingReview() {
  return useQuery({
    queryKey: ['jobs-needing-review'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('unified_jobs')
        .select(`
          *,
          assigned_user:users!unified_jobs_assigned_user_id_fkey(id, display_name, email)
        `)
        .in('status', ['SUBMITTED'])
        .order('updated_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });
}

// ============ REVIEW PROGRESS ============

export type ReviewProgressMap = Record<string, {
  approved: number;
  changesRequested: number;
  pending: number;
  total: number;
}>;

export function useJobsReviewProgress() {
  return useQuery({
    queryKey: ['jobs-review-progress'],
    queryFn: async () => {
      // First get all submissions to find the latest per job
      const { data: submissions, error: subError } = await supabase
        .from('job_submissions')
        .select('id, job_id, version_number')
        .order('version_number', { ascending: false });
      
      if (subError) throw subError;
      
      // Get only the highest version per job
      const latestByJob = new Map<string, string>();
      for (const sub of submissions || []) {
        if (!latestByJob.has(sub.job_id)) {
          latestByJob.set(sub.job_id, sub.id);
        }
      }
      
      const latestSubmissionIds = Array.from(latestByJob.values());
      
      if (latestSubmissionIds.length === 0) {
        return {} as ReviewProgressMap;
      }
      
      // Fetch assets only for latest submissions
      const { data, error } = await supabase
        .from('submission_assets')
        .select(`
          id,
          review_status,
          submission:job_submissions!inner(job_id)
        `)
        .in('submission_id', latestSubmissionIds);
      
      if (error) throw error;
      
      // Aggregate by job_id
      const progressMap: ReviewProgressMap = {};
      
      for (const asset of data || []) {
        const jobId = (asset.submission as any)?.job_id;
        if (!jobId) continue;
        
        if (!progressMap[jobId]) {
          progressMap[jobId] = { approved: 0, changesRequested: 0, pending: 0, total: 0 };
        }
        
        progressMap[jobId].total++;
        
        switch (asset.review_status) {
          case 'APPROVED':
            progressMap[jobId].approved++;
            break;
          case 'CHANGES_REQUESTED':
            progressMap[jobId].changesRequested++;
            break;
          default:
            progressMap[jobId].pending++;
        }
      }
      
      return progressMap;
    },
  });
}
