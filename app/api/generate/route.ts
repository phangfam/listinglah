import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { jsonrepair } from "jsonrepair";
import { createClient } from "@/lib/supabase/server";
import { FREE_LIMIT } from "@/lib/constants";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface ListingInput {
  propertyType: string;
  location: string;
  propertyDetails?: string;
}

export interface CopyVariants {
  facebook_caption: string;
  whatsapp_pitch: string;
  propertyguru_description: string;
}

export interface GeneratedCopy {
  en: CopyVariants;
  bm: CopyVariants;
  zh: CopyVariants;
}

function buildPrompt(listing: ListingInput): string {
  return `You are a top-performing Malaysian property agent who also writes killer copy. You write like a real human — punchy, warm, and persuasive — never like a brochure or a robot.

PROPERTY DETAILS:
- Type: ${listing.propertyType}
- Location: ${listing.location}
- Details: ${listing.propertyDetails || "None provided"}

Extract all relevant information from the Details field naturally — beds, baths, size, price, tenure, furnishing, views, special features, nearby amenities, etc. Use only what is present; do not invent facts not mentioned.

Generate listing copy in 3 languages (English, Bahasa Malaysia, Simplified Chinese) and 3 formats each. Respond ONLY with valid JSON in this exact schema:

{
  "en": {
    "facebook_caption": "...",
    "whatsapp_pitch": "...",
    "propertyguru_description": "..."
  },
  "bm": {
    "facebook_caption": "...",
    "whatsapp_pitch": "...",
    "propertyguru_description": "..."
  },
  "zh": {
    "facebook_caption": "...",
    "whatsapp_pitch": "...",
    "propertyguru_description": "..."
  }
}

FORMAT REQUIREMENTS:

facebook_caption (150-220 words total, with emojis):
- Line 1: A single bold emotional hook — a desire, fear, or dream the buyer has. NOT a feature list. Make it feel like it was written for one specific person scrolling their feed at 11pm. Example style: "Still paying rent while watching prices climb? This one might change that." Use the actual property and location to make it specific.
- Line 2: The payoff — one vivid sentence about what life looks like owning this property. Make it aspirational.
- Line 3: One sharp, concrete fact that makes the deal real (price per sqft, proximity to something important, or a scarcity signal).
- Then: specs, key highlights, price, and a CTA to DM or WhatsApp. Use emojis naturally — not as decoration on every line.

whatsapp_pitch (55-80 words, NO emojis):
- Write as if you are personally texting a warm lead you met at an open house. Natural, friendly, direct.
- Mention one specific thing that makes this property worth their time — not a list of specs.
- End with a yes-or-yes closing question that offers two timing options, e.g. "Would this weekend or early next week work better for a viewing?" (English), "Awak free hujung minggu ni atau minggu depan untuk tengok?" (BM), "您方便这个周末还是下周来看看？" (ZH). Tailor the question naturally to the language and tone.

propertyguru_description (220-350 words, NO emojis):
- Open with ONE strong sentence that earns the reader's attention — a lifestyle image, a market insight, or a bold claim specific to this property. Do NOT start with the property type and location like a form letter.
- Then cover: property highlights, room/space details, building/development features, location and connectivity, lifestyle and amenities, investment or ownership angle.
- Close with a confident CTA (call/WhatsApp to arrange viewing).
- Professional tone, but written by a human who knows the area — not a template.

LANGUAGE NOTES:
- English (en): Natural, confident Malaysian English. Not British-formal, not American-casual.
- Bahasa Malaysia (bm): Conversational Malaysian BM as used in property ads and agent WhatsApp groups — warm but credible. Avoid stiff textbook BM.
- Simplified Chinese (zh): Write as a Malaysian Chinese agent would — mix of genuine warmth and practical value-focus. Use 简体字. Avoid overly formal or mainland-government tone. The WhatsApp pitch should feel like a WeChat message from someone you trust.

CRITICAL JSON RULES (the output must parse with JSON.parse):
- All line breaks within copy text MUST be represented as the two-character sequence \\n — never a literal newline character inside a JSON string value.
- Never use unescaped double-quote characters inside string values — use a single apostrophe instead (e.g. you're, it's, don't).
- Output raw JSON only — no markdown fences, no commentary before or after.`;
}

async function getOrCreateSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string
): Promise<{ count: number; isPaid: boolean }> {
  const { data } = await supabase
    .from("usage_sessions")
    .select("generation_count, is_paid")
    .eq("id", sessionId)
    .maybeSingle();

  if (!data) {
    await supabase
      .from("usage_sessions")
      .insert({ id: sessionId, generation_count: 0, is_paid: false });
    return { count: 0, isPaid: false };
  }
  return { count: data.generation_count, isPaid: data.is_paid };
}

async function incrementSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
  currentCount: number
) {
  await supabase
    .from("usage_sessions")
    .update({
      generation_count: currentCount + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, ...listingBody } = body as { sessionId?: string } & ListingInput;
    const listing: ListingInput = listingBody;

    if (!listing.location || !listing.propertyType) {
      return NextResponse.json(
        { error: "location and propertyType are required" },
        { status: 400 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not configured" },
        { status: 500 }
      );
    }

    const supabase = await createClient();

    // Enforce free tier limit
    let sessionCount = 0;
    if (sessionId) {
      const { count, isPaid } = await getOrCreateSession(supabase, sessionId);
      if (!isPaid && count >= FREE_LIMIT) {
        return NextResponse.json({ limitReached: true }, { status: 402 });
      }
      sessionCount = count;
    }

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{ role: "user", content: buildPrompt(listing) }],
    });

    const raw = message.content[0];
    if (raw.type !== "text") throw new Error("Unexpected response type from Claude");

    const stripped = raw.text.replace(/^```json\n?|```$/gm, "").trim();
    const generated: GeneratedCopy = JSON.parse(jsonrepair(stripped));

    // Increment session count after successful generation
    if (sessionId) {
      await incrementSession(supabase, sessionId, sessionCount);
    }

    // Persist listing + copies
    const { data: listingRow, error: listingErr } = await supabase
      .from("listings")
      .insert({
        session_id: sessionId ?? null,
        property_type: listing.propertyType,
        location: listing.location,
        highlights: listing.propertyDetails ?? null,
      })
      .select()
      .single();

    if (listingErr) {
      console.error("Failed to save listing:", listingErr.message);
      return NextResponse.json({ generated });
    }

    const copyRows = (["en", "bm", "zh"] as const).map((lang) => ({
      listing_id: listingRow.id,
      language: lang,
      facebook_caption: generated[lang].facebook_caption,
      whatsapp_pitch: generated[lang].whatsapp_pitch,
      propertyguru_description: generated[lang].propertyguru_description,
    }));

    await supabase.from("generated_copies").insert(copyRows);

    return NextResponse.json({ generated, listingId: listingRow.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Generate error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
