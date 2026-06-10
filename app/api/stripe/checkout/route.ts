import { createCheckoutSession } from "@/lib/stripe";
import { NextResponse } from "next/server";

/**
 * POST /api/stripe/checkout
 * Body: { priceId: string, sessionId: string, successUrl?: string, cancelUrl?: string }
 *
 * Session-based checkout (no auth required in v1). The sessionId links the
 * Stripe purchase back to the browser session so we can unlock Pro access.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { priceId, sessionId, successUrl, cancelUrl } = body as {
      priceId: string;
      sessionId: string;
      successUrl?: string;
      cancelUrl?: string;
    };

    if (!priceId) {
      return NextResponse.json({ error: "priceId is required" }, { status: 400 });
    }
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "";

    const session = await createCheckoutSession({
      priceId,
      userId: sessionId,
      successUrl: successUrl ?? `${origin}/?checkout=success&sid=${sessionId}`,
      cancelUrl: cancelUrl ?? `${origin}/?checkout=canceled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe/checkout]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
