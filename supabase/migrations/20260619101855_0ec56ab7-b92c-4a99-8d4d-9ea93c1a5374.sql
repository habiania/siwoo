
DO $$ BEGIN
  CREATE TYPE public.listing_status AS ENUM ('pending','success','failed','skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.platform_listings
  ADD COLUMN IF NOT EXISTS external_listing_id text,
  ADD COLUMN IF NOT EXISTS status public.listing_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS listed_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.platform_listings
    ADD CONSTRAINT platform_listings_product_platform_uniq UNIQUE (product_id, platform);
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN duplicate_table THEN NULL; END $$;
