import "server-only";
import { Resend } from "resend";

// Requires RESEND_API_KEY in the environment. Until then, magic links are logged instead of
// emailed so the sign-in flow stays testable without a configured provider.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// One verified Resend domain serves every tenant — each restaurant sends as its own address on
// it (e.g. "Al Zayt <alzayt@mail.luvder.com>") rather than all tenants sharing one generic
// sender, so a customer's inbox shows which restaurant actually emailed them.
const SENDING_DOMAIN = process.env.RESEND_SENDING_DOMAIN || "mail.luvder.com";

// Email has no live request to read a Host header from (unlike the magic-link URL itself, see
// resolveOrigin in loyalty-auth.ts) — this is only for a small static footer logo image, not a
// link the customer clicks, so the platform's own canonical domain is fine here.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://pos.luvder.com";

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
      <p style="margin-top:24px">
        <img src="${APP_URL}/brand/iq-pos-logo.png" alt="IQ POS" width="20" height="20" style="vertical-align:middle;border:0" />
        <span style="color:#aaa;font-size:11px;vertical-align:middle;margin-left:6px">Powered by IQ POS</span>
      </p>
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

// A purchase order to a supplier (docs/retail-plan step 4.5). Sent as the business, like the
// loyalty emails. Returns false when nothing was sent (no email provider configured or Resend
// refused it), so the screen can say so instead of marking the order as emailed.
export async function sendPurchaseOrderEmail(input: {
  to: string;
  businessName: string;
  number: string;
  supplierName: string;
  expected?: string | null;
  notes?: string | null;
  currencySymbol: string;
  lines: { name: string; supplierCode?: string | null; qty: number; unit: string; unitCost?: number | null }[];
  total?: number | null;
}): Promise<boolean> {
  if (!resend) {
    console.log(`[purchase-order] RESEND_API_KEY not set — ${input.number} for ${input.to} not emailed`);
    return false;
  }
  const from = `${sanitizeDisplayName(input.businessName)} <${emailLocalPart(input.businessName)}@${SENDING_DOMAIN}>`;
  const money = (n: number) => `${input.currencySymbol}${n.toFixed(2)}`;
  const rows = input.lines
    .map(
      (l) => `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(l.name)}${l.supplierCode ? ` <span style="color:#888">(${escapeHtml(l.supplierCode)})</span>` : ""}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${Math.round(l.qty * 1000) / 1000} ${escapeHtml(l.unit)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${l.unitCost != null ? money(l.unitCost) : ""}</td>
      </tr>`
    )
    .join("");
  const { error } = await resend.emails.send({
    from,
    to: input.to,
    subject: `Purchase order ${input.number} from ${input.businessName}`,
    html: `
      <p>Hello ${escapeHtml(input.supplierName)},</p>
      <p>Please supply the following — purchase order <strong>${escapeHtml(input.number)}</strong> from ${escapeHtml(input.businessName)}${
        input.expected ? `, wanted by <strong>${escapeHtml(input.expected)}</strong>` : ""
      }.</p>
      <table style="border-collapse:collapse;font-size:14px;min-width:360px">
        <thead><tr style="text-align:left;color:#666"><th style="padding:6px 10px">Item</th><th style="padding:6px 10px;text-align:right">Quantity</th><th style="padding:6px 10px;text-align:right">Cost each</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${input.total != null ? `<p style="font-size:14px"><strong>Order total:</strong> ${money(input.total)}</p>` : ""}
      ${input.notes ? `<p style="font-size:14px"><strong>Notes:</strong> ${escapeHtml(input.notes)}</p>` : ""}
      <p style="margin-top:24px">
        <img src="${APP_URL}/brand/iq-pos-logo.png" alt="IQ POS" width="20" height="20" style="vertical-align:middle;border:0" />
        <span style="color:#aaa;font-size:11px;vertical-align:middle;margin-left:6px">Powered by IQ POS</span>
      </p>
    `,
  });
  if (error) {
    console.error(`[purchase-order] Resend failed to send ${input.number} to ${input.to}:`, error);
    return false;
  }
  return true;
}
