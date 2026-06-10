import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface ListingInput {
  propertyType: string;
  bedrooms?: number;
  bathrooms?: number;
  builtUpSqft?: number;
  landAreaSqft?: number;
  furnishing?: string;
  tenure?: string;
  askingPriceMyr?: number;
  location: string;
  highlights?: string;
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
  const priceStr = listing.askingPriceMyr
    ? `RM ${listing.askingPriceMyr.toLocaleString()}`
    : "price on request";

  const specs = [
    listing.bedrooms ? `${listing.bedrooms} bedrooms` : null,
    listing.bathrooms ? `${listing.bathrooms} bathrooms` : null,
    listing.builtUpSqft ? `${listing.builtUpSqft} sqft built-up` : null,
    listing.landAreaSqft ? `${listing.landAreaSqft} sqft land area` : null,
    listing.furnishing ? `${listing.furnishing}` : null,
    listing.tenure ? `${listing.tenure} tenure` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return `You are an expert real estate copywriter for Southeast Asian markets (Malaysia, Singapore, Indonesia). Generate compelling, conversion-ready property listing copy.

PROPERTY DETAILS:
- Type: ${listing.propertyType}
- Location: ${listing.location}
- Specs: ${specs || "N/A"}
- Asking Price: ${priceStr}
- Key Highlights: ${listing.highlights || "None provided"}

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
- facebook_caption: 150-220 words, attention-grabbing headline, relevant emojis, key specs, price, strong call to action (DM/WhatsApp). Optimised for Facebook property groups.
- whatsapp_pitch: 60-90 words, conversational and warm, perfect for copy-pasting into WhatsApp to a prospect. No emojis. End with "Interested? Let me know!"
- propertyguru_description: 200-350 words, professional, SEO-friendly, detailed. Cover property features, location benefits, investment value, and lifestyle. No emojis.

For Bahasa Malaysia (bm): use natural, professional Malaysian BM as spoken in property ads — not overly formal.
For Simplified Chinese (zh): use mainland-style Simplified Chinese characters, clear and professional, suited for Malaysian Chinese property buyers.`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const listing: ListingInput = body;

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

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: buildPrompt(listing),
        },
      ],
    });

    const raw = message.content[0];
    if (raw.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    // Strip markdown code fences if present
    const cleaned = raw.text.replace(/^```json\n?|```$/gm, "").trim();
    const generated: GeneratedCopy = JSON.parse(cleaned);

    // Persist to Supabase
    const supabase = await createClient();

    const { data: listingRow, error: listingErr } = await supabase
      .from("listings")
      .insert({
        session_id: body.sessionId ?? null,
        property_type: listing.propertyType,
        bedrooms: listing.bedrooms ?? null,
        bathrooms: listing.bathrooms ?? null,
        built_up_sqft: listing.builtUpSqft ?? null,
        land_area_sqft: listing.landAreaSqft ?? null,
        furnishing: listing.furnishing ?? null,
        tenure: listing.tenure ?? null,
        asking_price_myr: listing.askingPriceMyr ?? null,
        location: listing.location,
        highlights: listing.highlights ?? null,
      })
      .select()
      .single();

    if (listingErr) {
      // Non-fatal: return generated copy even if DB save fails
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
