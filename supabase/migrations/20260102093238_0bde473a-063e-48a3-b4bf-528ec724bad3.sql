-- Enable realtime for face_pairing_outputs table
ALTER PUBLICATION supabase_realtime ADD TABLE public.face_pairing_outputs;

-- Enable realtime for face_pairings table (for outfit description updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.face_pairings;