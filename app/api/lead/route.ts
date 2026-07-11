import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidEmail } from "@/lib/constants";

/**
 * POST /api/lead
 * Body: { email: string }
 *
 * One-time email capture for the front-door gate (no auth in v1). Stores the
 * email in the `leads` table with a first-visit timestamp. Idempotent: a
 * returning visitor (or a retry) does not overwrite their original
 * first_visit_at and does not error.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawEmail = typeof body.email === "string" ? body.email : "";
    const email = rawEmail.trim().toLowerCase();

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Insert once; ignore duplicates so first_visit_at is preserved across
    // re-submits and returning visitors who cleared their browser storage.
    const { error } = await supabase
      .from("leads")
      .upsert({ email }, { onConflict: "email", ignoreDuplicates: true });

    if (error) {
      console.error("[api/lead] failed to store lead:", error.message);
      return NextResponse.json(
        { error: "Could not save your email. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/lead]", message);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
