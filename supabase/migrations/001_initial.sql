-- listings: stores property details entered by agent
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

-- generated_copies: AI-generated listing copy per listing per language
CREATE TABLE IF NOT EXISTS generated_copies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
  language TEXT NOT NULL CHECK (language IN ('en', 'bm', 'zh')),
  facebook_caption TEXT NOT NULL,
  whatsapp_pitch TEXT NOT NULL,
  propertyguru_description TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- profiles: agent accounts with usage tracking (populated on auth signup)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY,
  email TEXT,
  stripe_customer_id TEXT,
  subscription_status TEXT DEFAULT 'free',
  monthly_usage_count INT DEFAULT 0,
  usage_reset_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: allow public read/write on listings + generated_copies (no auth in v1)
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_copies ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_listings" ON listings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_copies" ON generated_copies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "own_profile" ON profiles FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
