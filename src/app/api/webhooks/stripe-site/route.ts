import { NextResponse, type NextRequest } from "next/server";
import { recordWebhookPaid } from "@/lib/site/projects";
import { verifyStripeSignature } from "@/lib/site/stripe";

// Stripe → website-builder payments. Point a Stripe webhook at /api/webhooks/stripe-site for the event
// checkout.session.completed and save its signing secret in Super Admin → Website builder. The customer's
// return to the studio page confirms the payment on its own too; this covers someone who pays and closes the tab.
export async function POST(req: NextRequest) {
  const payload = await req.text();
  if (!(await verifyStripeSignature(payload, req.headers.get("stripe-signature")))) {
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }
  try {
    const event = JSON.parse(payload) as { type?: string; data?: { object?: { id?: string; payment_status?: string; metadata?: Record<string, string> } } };
    const session = event.data?.object;
    if ((event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") && session?.id && session.payment_status === "paid") {
      await recordWebhookPaid(session.id, session.metadata?.payment_id);
    }
  } catch (error) {
    console.error("[stripe-site webhook]", error);
    return NextResponse.json({ error: "Could not process" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
