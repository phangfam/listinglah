import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { FREE_LIMIT } from "@/lib/constants";

// Instantiated lazily inside the handler (not at module load) so `next build`
// can collect page data even when ANTHROPIC_API_KEY is not present in the
// build environment.
function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export interface ListingInput {
  propertyType: string;
  location: string;
  propertyDetails?: string;
}

/** Agent contact details injected into copy when the agent opts in. */
export interface ContactInfo {
  name: string;
  agencyName: string;
  whatsappNumber: string;
  tagline: string;
}

export interface CopyVariants {
  headlines: string[];
  facebook_caption: string;
  whatsapp_pitch: string;
  propertyguru_description: string;
}

export interface GeneratedCopy {
  en: CopyVariants;
  bm: CopyVariants;
  zh: CopyVariants;
}

// Strict tool schema — the model returns the copy as a validated tool call
// instead of free-form JSON text. This guarantees the input parses (the SDK
// hands back `tool_use.input` already parsed) and eliminates the class of
// JSON-parse failures that free-text output produced (unescaped quotes,
// literal newlines, stray commas). `strict: true` requires additionalProperties
// false + every property in `required` on each object.
const LANG_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    headlines: {
      type: "array",
      items: { type: "string" },
      description:
        "Exactly 5 distinct, cliché-free hook-style headline options for this listing.",
    },
    facebook_caption: { type: "string" },
    whatsapp_pitch: { type: "string" },
    propertyguru_description: { type: "string" },
  },
  required: ["headlines", "facebook_caption", "whatsapp_pitch", "propertyguru_description"],
} as const;

const LISTING_TOOL: Anthropic.Tool = {
  name: "emit_listing_copy",
  description:
    "Return the generated property listing copy in all three languages (en, bm, zh), each with 5 headlines and the 3 copy formats.",
  // `strict` is a top-level tool field (GA, no beta) that guarantees the input validates.
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: { en: LANG_SCHEMA, bm: LANG_SCHEMA, zh: LANG_SCHEMA },
    required: ["en", "bm", "zh"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any,
};

function buildContactBlock(contact?: ContactInfo | null): string {
  if (!contact) return "";
  const lines: string[] = [];
  if (contact.name) lines.push(`- Agent name: ${contact.name}`);
  if (contact.agencyName) lines.push(`- Agency: ${contact.agencyName}`);
  if (contact.whatsappNumber) lines.push(`- WhatsApp: ${contact.whatsappNumber}`);
  if (contact.tagline) lines.push(`- Tagline: ${contact.tagline}`);
  if (lines.length === 0) return "";

  return `

AGENT CONTACT (IMPORTANT):
End the facebook_caption, whatsapp_pitch and propertyguru_description of EVERY language with a natural, localized closing call-to-action that uses these details. For example: "Contact ${contact.name || "the agent"}${contact.whatsappNumber ? ` at ${contact.whatsappNumber}` : ""} to arrange a viewing." Weave it in naturally in each language — do not just paste English into the BM/中文 versions. Do NOT add contact details to the headlines.
${lines.join("\n")}`;
}

function buildPrompt(listing: ListingInput, contact?: ContactInfo | null): string {
  return `You are a top-performing Malaysian property agent who also writes killer copy. You write like a real human — punchy, warm, and persuasive — never like a brochure or a robot.

PROPERTY DETAILS:
- Type: ${listing.propertyType}
- Location: ${listing.location}
- Details: ${listing.propertyDetails || "None provided"}

Extract all relevant information from the Details field naturally — beds, baths, size, price, tenure, furnishing, views, special features, nearby amenities, etc. Use only what is present; do not invent facts not mentioned.
${buildContactBlock(contact)}

Generate listing copy in 3 languages (English = en, Bahasa Malaysia = bm, Simplified Chinese = zh). For each language produce EXACTLY 5 headline options plus the 3 copy formats, and return everything by calling the emit_listing_copy tool. Do not reply with prose — use the tool.

FORMAT REQUIREMENTS:

headlines (array of EXACTLY 5 strings):
- 5 DISTINCT, scroll-stopping headline options an agent can use as a post title or listing headline.
- Each under ~12 words, punchy and specific to THIS property and location.
- Vary the angle across the 5: e.g. lifestyle, investment upside, scarcity, location/connectivity, price-value.
- BAN generic clichés and filler: never use "Must View", "Freehold Gem", "Value Buy", "Rare Find", "Don't Miss Out", "Hot Deal", "Dream Home", or similar empty phrases. Every headline must say something concrete.

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

Line breaks inside copy are fine — put real newlines between paragraphs. Return the result by calling emit_listing_copy.`;
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
    const { error } = await supabase
      .from("usage_sessions")
      .insert({ id: sessionId, generation_count: 0, is_paid: false });
    if (error) {
      console.error(`[api/generate] Failed to create usage session ${sessionId}:`, error.message);
    }
    return { count: 0, isPaid: false };
  }
  return { count: data.generation_count, isPaid: data.is_paid };
}

async function incrementSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
  currentCount: number
) {
  const { error } = await supabase
    .from("usage_sessions")
    .update({
      generation_count: currentCount + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
  if (error) {
    console.error(`[api/generate] Failed to increment usage session ${sessionId}:`, error.message);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, includeContact, ...listingBody } = body as {
      sessionId?: string;
      includeContact?: boolean;
    } & ListingInput;
    const listing: ListingInput = {
      propertyType: listingBody.propertyType,
      location: listingBody.location,
      propertyDetails: listingBody.propertyDetails,
    };

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

    // If the agent opted in, load their saved contact info to inject a CTA.
    let contact: ContactInfo | null = null;
    if (includeContact && sessionId) {
      const { data: prof, error: profErr } = await supabase
        .from("agent_profiles")
        .select("name, agency_name, whatsapp_number, tagline")
        .eq("session_id", sessionId)
        .maybeSingle();
      if (profErr) {
        console.error(`[api/generate] Failed to load agent profile ${sessionId}:`, profErr.message);
      }
      if (prof) {
        contact = {
          name: prof.name ?? "",
          agencyName: prof.agency_name ?? "",
          whatsappNumber: prof.whatsapp_number ?? "",
          tagline: prof.tagline ?? "",
        };
      }
    }

    const message = await getAnthropic().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      tools: [LISTING_TOOL],
      tool_choice: { type: "tool", name: LISTING_TOOL.name },
      messages: [{ role: "user", content: buildPrompt(listing, contact) }],
    });

    // With a forced tool_choice, Claude returns the copy as a tool_use block
    // whose `input` the SDK has already parsed and the API validated against
    // LISTING_TOOL's schema — no manual JSON parsing / repair needed.
    const toolUse = message.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error("Model did not return listing copy");
    }
    const generated = toolUse.input as GeneratedCopy;

    // Defensively normalize headlines: ensure each language has a clean string[]
    // (the model can occasionally omit or malform the array).
    for (const lang of ["en", "bm", "zh"] as const) {
      const v = generated[lang];
      if (v) {
        v.headlines = Array.isArray(v.headlines)
          ? v.headlines.filter((h): h is string => typeof h === "string" && h.trim().length > 0)
          : [];
      }
    }

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
      console.error("[api/generate] Failed to save listing:", listingErr.message);
      return NextResponse.json({ generated });
    }

    const copyRows = (["en", "bm", "zh"] as const).map((lang) => ({
      listing_id: listingRow.id,
      language: lang,
      headlines: generated[lang].headlines ?? [],
      facebook_caption: generated[lang].facebook_caption,
      whatsapp_pitch: generated[lang].whatsapp_pitch,
      propertyguru_description: generated[lang].propertyguru_description,
    }));

    // Persistence failures here don't fail the request (the user still gets
    // their copy), but they MUST be logged — a silent failure previously hid
    // the fact that generated_copies didn't exist, leaving history empty.
    const { error: copiesErr } = await supabase.from("generated_copies").insert(copyRows);
    if (copiesErr) {
      console.error(
        `[api/generate] Failed to save generated_copies for listing ${listingRow.id}:`,
        copiesErr.message
      );
    }

    return NextResponse.json({ generated, listingId: listingRow.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Generate error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
