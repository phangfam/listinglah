import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidEmail } from "@/lib/constants";

/**
 * Agent profile read/write, keyed on the captured email (the same `sessionId`
 * identity used by usage_sessions / listings). No auth in v1 — same public
 * pattern as /api/lead. Requires the `agent_profiles` table (migration 004).
 */

export interface AgentProfile {
  name: string;
  agencyName: string;
  whatsappNumber: string;
  tagline: string;
}

// Keep free-text fields to a sane length so they can be safely inlined into
// generation prompts and rendered without breaking layout.
const MAX_LEN = 120;
const clean = (v: unknown): string =>
  (typeof v === "string" ? v : "").trim().slice(0, MAX_LEN);

/** GET /api/profile?sessionId=<email> → { profile: AgentProfile | null } */
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId || !isValidEmail(sessionId)) {
    return NextResponse.json({ profile: null });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_profiles")
    .select("name, agency_name, whatsapp_number, tagline")
    .eq("session_id", sessionId.toLowerCase())
    .maybeSingle();

  if (error) {
    console.error("[api/profile] read failed:", error.message);
    return NextResponse.json({ profile: null });
  }
  if (!data) return NextResponse.json({ profile: null });

  return NextResponse.json({
    profile: {
      name: data.name ?? "",
      agencyName: data.agency_name ?? "",
      whatsappNumber: data.whatsapp_number ?? "",
      tagline: data.tagline ?? "",
    } satisfies AgentProfile,
  });
}

/**
 * POST /api/profile
 * Body: { sessionId, name, agencyName, whatsappNumber, tagline }
 * Upserts the profile for this email. Idempotent.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const sessionId =
      typeof body.sessionId === "string" ? body.sessionId.trim().toLowerCase() : "";

    if (!isValidEmail(sessionId)) {
      return NextResponse.json({ error: "A valid email identity is required." }, { status: 400 });
    }

    const profile: AgentProfile = {
      name: clean(body.name),
      agencyName: clean(body.agencyName),
      whatsappNumber: clean(body.whatsappNumber),
      tagline: clean(body.tagline),
    };

    const supabase = await createClient();
    const { error } = await supabase.from("agent_profiles").upsert(
      {
        session_id: sessionId,
        name: profile.name || null,
        agency_name: profile.agencyName || null,
        whatsapp_number: profile.whatsappNumber || null,
        tagline: profile.tagline || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "session_id" }
    );

    if (error) {
      console.error("[api/profile] save failed:", error.message);
      return NextResponse.json(
        { error: "Could not save your profile. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/profile]", message);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
