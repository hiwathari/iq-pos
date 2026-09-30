import "server-only";
import { Resend } from "resend";

// Requires RESEND_API_KEY in the environment. Until then, magic links are logged instead of
// emailed so the sign-in flow stays testable without a configured provider.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// One verified Resend domain serves every tenant — each restaurant sends as its own address on
// it (e.g. "Al Zayt <alzayt@mail.luvder.com>") rather than all tenants sharing one generic
// sender, so a customer's inbox shows which restaurant actually emailed them.
const SENDING_DOMAIN = process.env.RESEND_SENDING_DOMAIN || "mail.luvder.com";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function emailLocalPart(restaurantName: string) {
  return restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 40) || "restaurant";
}

// A display name sits unquoted before <...> in a From header, so strip characters that would
// break or spoof that syntax rather than trying to quote-escape them.
function sanitizeDisplayName(name: string) {
  return name.replace(/["<>\r\n]/g, "").trim() || "IQ POS";
}

// `code` is optional so the admin-facing loyalty-lookup login (my-card) and the customer
// ordering sign-in can share one email template — both ways sign in to the same account.
export async function sendLoyaltyMagicLinkEmail(input: { to: string; restaurantName: string; link: string; code?: string }) {
  if (!resend) {
    console.log(
      `[magic-link] RESEND_API_KEY not set — sign-in for ${input.to}: link=${input.link}${input.code ? ` code=${input.code}` : ""}`
    );
    return;
  }

  const from = `${sanitizeDisplayName(input.restaurantName)} <${emailLocalPart(input.restaurantName)}@${SENDING_DOMAIN}>`;
  const { error } = await resend.emails.send({
    from,
    to: input.to,
    subject: `Sign in to ${input.restaurantName}`,
    html: `
      <p>Tap the link below to sign in to your ${escapeHtml(input.restaurantName)} account:</p>
      <p><a href="${input.link}">${input.link}</a></p>
      ${
        input.code
          ? `<p>Or enter this code on the sign-in page: <strong style="font-size:20px;letter-spacing:2px">${escapeHtml(input.code)}</strong></p>`
          : ""
      }
      <p style="color:#888;font-size:13px">This expires in 15 minutes. If you didn't request this, you can ignore this email.</p>
    `,
  });
  // Resend's SDK reports a send failure (e.g. a not-yet-verified domain) via this `error` field
  // rather than throwing — surfaced here as a loud server log (findable in Vercel's runtime logs)
  // instead of an unhandled exception, so a misconfigured/pending domain degrades to "the customer
  // didn't get the email" rather than breaking the whole sign-in action.
  if (error) {
    console.error(`[magic-link] Resend failed to send to ${input.to} from ${from}:`, error);
  }
}
