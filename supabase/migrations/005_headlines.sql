-- Headline-variants feature.
--
-- Adds the `headlines` column used to store 5 hook-style headline options per
-- generated-copy row. This migration is SELF-CONTAINED and idempotent: it also
-- (re)creates the `listings` and `generated_copies` tables if they are missing,
-- because migration 001 was not applied on this database (generation swallows
-- persistence errors, so this went unnoticed — history simply stayed empty).
--
-- ⚠️ MANUAL APPLY REQUIRED ⚠️  Run in the Supabase SQL editor. Safe to run on a
-- fresh DB or one where the tables already exist.

-- Property details entered by the agent.
CREATE TABLE IF NOT EXISTS listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT,
  property_type TEXT NOT NULL,
  bedrooms INT,
  bathrooms INT,
  built_up_sqft INT,
  land_area_sqft INT,
  furnishing TEXT,
  tenure TEXT,
  asking_price_myr BIGINT,
  location TEXT NOT NULL,
  highlights TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- AI-generated listing copy per listing per language (with headline options).
CREATE TABLE IF NOT EXISTS generated_copies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
  language TEXT NOT NULL CHECK (language IN ('en', 'bm', 'zh')),
  headlines JSONB NOT NULL DEFAULT '[]'::jsonb,
  facebook_caption TEXT NOT NULL,
  whatsapp_pitch TEXT NOT NULL,
  propertyguru_description TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- If generated_copies already existed (from a partial 001), ensure the column.
ALTER TABLE generated_copies
  ADD COLUMN IF NOT EXISTS headlines JSONB NOT NULL DEFAULT '[]'::jsonb;

-- RLS: public read/write (no auth in v1) — idempotent via DROP ... IF EXISTS.
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_copies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_listings" ON listings;
CREATE POLICY "public_listings" ON listings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public_copies" ON generated_copies;
CREATE POLICY "public_copies" ON generated_copies FOR ALL USING (true) WITH CHECK (true);
