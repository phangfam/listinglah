import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { GeneratedCopy, CopyVariants } from "../generate/route";

/**
 * GET /api/history?sessionId=<email>
 *
 * Returns the visitor's most recent generations (newest first). Generations are
 * already persisted by /api/generate into `listings` (keyed by session_id =
 * email) and `generated_copies`, so history just reads those back — no separate
 * table required. Reconstructs each listing's copies into the same GeneratedCopy
 * shape the UI renders for a fresh generation.
 */

const HISTORY_LIMIT = 10;

const emptyVariants = (): CopyVariants => ({
  facebook_caption: "",
  whatsapp_pitch: "",
  propertyguru_description: "",
});

export interface HistoryItem {
  id: string;
  propertyType: string;
  location: string;
  createdAt: string;
  generated: GeneratedCopy;
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ items: [] });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .select(
      "id, property_type, location, created_at, generated_copies(language, facebook_caption, whatsapp_pitch, propertyguru_description)"
    )
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  if (error) {
    console.error("[api/history]", error.message);
    return NextResponse.json({ items: [] });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];

  const items: HistoryItem[] = rows
    .map((row) => {
      const generated: GeneratedCopy = {
        en: emptyVariants(),
        bm: emptyVariants(),
        zh: emptyVariants(),
      };
      for (const c of row.generated_copies ?? []) {
        const lang = c.language as keyof GeneratedCopy;
        if (lang in generated) {
          generated[lang] = {
            facebook_caption: c.facebook_caption ?? "",
            whatsapp_pitch: c.whatsapp_pitch ?? "",
            propertyguru_description: c.propertyguru_description ?? "",
          };
        }
      }
      return {
        id: row.id as string,
        propertyType: row.property_type as string,
        location: row.location as string,
        createdAt: row.created_at as string,
        generated,
      };
    })
    // Skip any listing whose copies failed to save (nothing to show/copy).
    .filter(
      (it) =>
        it.generated.en.facebook_caption ||
        it.generated.bm.facebook_caption ||
        it.generated.zh.facebook_caption
    );

  return NextResponse.json({ items });
}
