-- Drop the existing overly permissive policy
DROP POLICY IF EXISTS "Public access to brands" ON public.brands;

-- Create new policies that require authentication
CREATE POLICY "Authenticated users can view brands"
ON public.brands
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert brands"
ON public.brands
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update brands"
ON public.brands
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete brands"
ON public.brands
FOR DELETE
TO authenticated
USING (true);