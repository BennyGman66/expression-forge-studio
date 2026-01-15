-- Enable full replica identity for realtime updates
ALTER TABLE unified_jobs REPLICA IDENTITY FULL;

-- Add to realtime publication so changes are broadcast to all connected clients
ALTER PUBLICATION supabase_realtime ADD TABLE unified_jobs;