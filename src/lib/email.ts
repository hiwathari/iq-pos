import "server-only";
import { Resend } from "resend";

// Requires RESEND_API_KEY (and optionally RESEND_FROM_EMAIL, once a sending domain is verified
// in Resend) in the environment. Until then, magic links are logged instead of emailed so the
// sign-in flow stays testable without a configured provider.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
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

  const from = process.env.RESEND_FROM_EMAIL || "IQ POS <onboarding@resend.dev>";
  await resend.emails.send({
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
}
