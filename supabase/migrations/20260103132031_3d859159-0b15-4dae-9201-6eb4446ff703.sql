-- Allow the trigger to insert user profiles (service role runs the trigger)
-- But also allow authenticated users to insert their own profile as fallback
CREATE POLICY "Users can insert own profile"
  ON public.users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Allow service role (trigger) to insert
CREATE POLICY "Service role can insert profiles"
  ON public.users FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Allow unauthenticated access for trigger context
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Allow the first admin to be created by themselves (bootstrap)
-- This allows a newly signed up user to give themselves a role initially
-- In production, you'd want to seed this or have a more secure bootstrap
CREATE POLICY "Users can create their own initial role"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() 
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    )
  );