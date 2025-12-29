-- Drop existing authenticated-only policies on brands
DROP POLICY IF EXISTS "Authenticated users can delete brands" ON public.brands;
DROP POLICY IF EXISTS "Authenticated users can insert brands" ON public.brands;
DROP POLICY IF EXISTS "Authenticated users can update brands" ON public.brands;
DROP POLICY IF EXISTS "Authenticated users can view brands" ON public.brands;

-- Create public access policies for brands
CREATE POLICY "Public can view brands" ON public.brands FOR SELECT USING (true);
CREATE POLICY "Public can insert brands" ON public.brands FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update brands" ON public.brands FOR UPDATE USING (true);
CREATE POLICY "Public can delete brands" ON public.brands FOR DELETE USING (true);