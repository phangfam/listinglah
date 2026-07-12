-- agent_profiles: per-agent contact info, keyed on the same email identity used
-- everywhere else (same no-auth v1 pattern as `leads` and `usage_sessions`).
-- One row per email. When the agent opts in, this info is auto-injected into
-- generated copy as a contact CTA (e.g. "Contact Sarah at +60123456789").
--
-- ⚠️ MANUAL APPLY REQUIRED ⚠️
-- This migration is NOT auto-applied. Run it in the Supabase SQL editor (or via
-- `supabase db push`) before deploying the agent-profile feature, otherwise the
-- /api/profile route will fail.
CREATE TABLE IF NOT EXISTS agent_profiles (
  session_id      TEXT PRIMARY KEY,          -- the agent's email (matches usage_sessions.id / listings.session_id)
  name            TEXT,
  agency_name     TEXT,
  whatsapp_number TEXT,
  tagline         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE agent_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_agent_profiles" ON agent_profiles FOR ALL USING (true) WITH CHECK (true);
