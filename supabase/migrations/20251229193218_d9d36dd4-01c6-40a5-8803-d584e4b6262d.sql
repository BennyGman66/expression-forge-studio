-- Create external_clients table
CREATE TABLE public.external_clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.external_clients ENABLE ROW LEVEL SECURITY;

-- RLS policy for external_clients
CREATE POLICY "Public access to external_clients" 
ON public.external_clients 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Create external_projects table
CREATE TABLE public.external_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.external_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.external_projects ENABLE ROW LEVEL SECURITY;

-- RLS policy for external_projects
CREATE POLICY "Public access to external_projects" 
ON public.external_projects 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Add project_id to client_reviews (nullable for backward compatibility)
ALTER TABLE public.client_reviews 
ADD COLUMN project_id UUID REFERENCES public.external_projects(id) ON DELETE SET NULL;