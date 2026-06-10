import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const FREE_LIMIT = 3;

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ count: 0, isPaid: false, limit: FREE_LIMIT });
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("usage_sessions")
    .select("generation_count, is_paid")
    .eq("id", sessionId)
    .single();

  return NextResponse.json({
    count: data?.generation_count ?? 0,
    isPaid: data?.is_paid ?? false,
    limit: FREE_LIMIT,
  });
}
