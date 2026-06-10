import { constructWebhookEvent } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type Stripe from "stripe";

/**
 * POST /api/stripe/webhooks
 *
 * Required events to enable in Stripe dashboard:
 *   - checkout.session.completed
 *   - customer.subscription.updated
 *   - customer.subscription.deleted
 *   - invoice.payment_failed
 */
export async function POST(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(payload, signature);
  } catch (err) {
    console.error("[stripe/webhooks] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = await createClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        // userId holds the sessionId for v1 session-based purchases
        const sessionId = session.metadata?.userId;
        if (!sessionId) break;

        await supabase
          .from("usage_sessions")
          .upsert(
            {
              id: sessionId,
              is_paid: true,
              stripe_customer_id: session.customer as string | null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        const sessionId = sub.metadata?.userId;
        if (!sessionId) break;

        const isActive = sub.status === "active" || sub.status === "trialing";
        await supabase
          .from("usage_sessions")
          .update({
            is_paid: isActive,
            stripe_subscription_id: sub.id,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", sub.customer as string);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await supabase
          .from("usage_sessions")
          .update({ is_paid: false, updated_at: new Date().toISOString() })
          .eq("stripe_subscription_id", sub.id);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        console.warn("[stripe/webhooks] payment failed for customer:", invoice.customer);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error(`[stripe/webhooks] error handling ${event.type}:`, err);
  }

  return NextResponse.json({ received: true });
}
