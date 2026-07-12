import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

/**
 * POST /api/regenerate — lightweight, single-section rewrite.
 *
 * Rewrites ONE piece of already-generated copy (a caption, pitch, description,
 * or headline) with a tone tweak. This is intentionally separate from
 * /api/generate:
 *   - It rewrites only the text it is given, so it is fast and cheap.
 *   - It does NOT touch `usage_sessions`, so refining does NOT count against the
 *     free-generation limit. (Usage is only incremented by a full generation.)
 */

// Instantiated lazily inside the handler (not at module load) so `next build`
// can collect page data even when ANTHROPIC_API_KEY is absent.
function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

type Tone = "punchier" | "formal" | "shorter";

const TONE_INSTRUCTION: Record<Tone, string> = {
  punchier:
    "Make it punchier and more energetic — sharper hook, stronger verbs, more scroll-stopping. Keep it persuasive, not gimmicky.",
  formal:
    "Make it more polished and professional in tone, while staying warm and human. Suitable for a portal listing.",
  shorter:
    "Shorten it noticeably — keep only the strongest, most persuasive lines. Tighten every sentence.",
};

const LANG_LABEL: Record<string, string> = {
  en: "Malaysian English",
  bm: "conversational Malaysian Bahasa Malaysia",
  zh: "Malaysian-style Simplified Chinese (简体字)",
};

const SECTION_LABEL: Record<string, string> = {
  facebook_caption: "Facebook property caption",
  whatsapp_pitch: "WhatsApp pitch to a warm lead",
  propertyguru_description: "PropertyGuru portal listing description",
  headline: "short scroll-stopping listing headline",
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const tone = body.tone as Tone;
    const language = typeof body.language === "string" ? body.language : "en";
    const section = typeof body.section === "string" ? body.section : "facebook_caption";

    if (!text) {
      return NextResponse.json({ error: "Nothing to refine." }, { status: 400 });
    }
    if (!TONE_INSTRUCTION[tone]) {
      return NextResponse.json({ error: "Unknown refine option." }, { status: 400 });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 500 });
    }

    const langLabel = LANG_LABEL[language] ?? LANG_LABEL.en;
    const sectionLabel = SECTION_LABEL[section] ?? SECTION_LABEL.facebook_caption;

    const prompt = `You are a top-performing Malaysian property agent and copywriter. Rewrite the following ${sectionLabel}, written in ${langLabel}.

${TONE_INSTRUCTION[tone]}

Keep the same language (${langLabel}), the same underlying facts, and any contact details (name / WhatsApp number / agency) exactly as they appear. Do not invent new facts.

Return ONLY the rewritten text — no preamble, no quotes, no markdown, no commentary.

TEXT TO REWRITE:
${text}`;

    const message = await getAnthropic().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = message.content[0];
    if (raw.type !== "text") throw new Error("Unexpected response type from Claude");

    // Strip any accidental wrapping quotes/fences the model may add.
    const cleaned = raw.text
      .replace(/^```[a-z]*\n?|```$/gim, "")
      .trim()
      .replace(/^"([\s\S]*)"$/, "$1")
      .trim();

    return NextResponse.json({ text: cleaned });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Regenerate error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
