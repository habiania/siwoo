ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS kipris_api_key text;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS auto_trademark_check boolean DEFAULT true;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS trademark_checked_at timestamptz;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS trademark_hits jsonb;