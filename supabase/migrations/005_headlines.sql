-- Add hook-style headline options to each generated-copy row (5 per language).
-- Stored as a JSON array of strings. Backfills to an empty array so existing
-- rows remain valid.
--
-- ⚠️ MANUAL APPLY REQUIRED ⚠️
-- This migration is NOT auto-applied. Run it in the Supabase SQL editor (or via
-- `supabase db push`) before deploying the headline-variants feature. Until it
-- is applied, generated copy still returns to the user, but persistence of the
-- generated_copies rows (and therefore history for new generations) will fail.
ALTER TABLE generated_copies
  ADD COLUMN IF NOT EXISTS headlines JSONB NOT NULL DEFAULT '[]'::jsonb;
