
CREATE TABLE public.members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  unavailable_ranges JSONB NOT NULL DEFAULT '[]'::jsonb,
  activities JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_transcript TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX members_name_lower_idx ON public.members (LOWER(name));

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read members"
  ON public.members FOR SELECT
  USING (true);

-- No public insert/update — writes happen through edge functions using service role.

CREATE TABLE public.ai_summary_cache (
  id INT PRIMARY KEY DEFAULT 1,
  summary TEXT,
  top_recommendation TEXT,
  unique_pick TEXT,
  member_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT singleton CHECK (id = 1)
);

ALTER TABLE public.ai_summary_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read summary"
  ON public.ai_summary_cache FOR SELECT
  USING (true);

INSERT INTO public.ai_summary_cache (id) VALUES (1);

-- Realtime support
ALTER TABLE public.members REPLICA IDENTITY FULL;
ALTER TABLE public.ai_summary_cache REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_summary_cache;
