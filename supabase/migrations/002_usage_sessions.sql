-- usage_sessions: tracks generation count per browser session (no-auth v1)
CREATE TABLE IF NOT EXISTS usage_sessions (
  id TEXT PRIMARY KEY,
  generation_count INT NOT NULL DEFAULT 0,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE usage_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_sessions" ON usage_sessions FOR ALL USING (true) WITH CHECK (true);
