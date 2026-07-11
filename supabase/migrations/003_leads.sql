-- leads: one-time email capture gate (no auth in v1).
-- One row per email, capturing the timestamp of their first visit.
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  first_visit_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_leads" ON leads FOR ALL USING (true) WITH CHECK (true);
