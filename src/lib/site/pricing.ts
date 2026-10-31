// IQ POS subscription plans shown on the website's Pricing page and home page. Prices are in GBP,
// excluding VAT. A plan button opens the /build brief with ?plan=<id>&billing=<monthly|annual>,
// and the chosen plan is saved on the website request (answers.plan) — there's no online
// checkout yet.

export type Billing = "monthly" | "annual";

export interface Plan {
  id: "basic" | "standard" | "premium";
  name: string;
  tagline: string;
  monthly: number;
  annual: number;
  features: string[];
  cta: string;
  popular?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: "basic",
    name: "Basic",
    tagline: "For a single small café or shop.",
    monthly: 35.99,
    annual: 399,
    features: ["1 till licence", "Card & contactless payments", "Product or menu management", "Daily sales reports", "Email support"],
    cta: "Choose Basic",
  },
  {
    id: "standard",
    name: "Standard",
    tagline: "For busy restaurants and stores.",
    monthly: 45.99,
    annual: 550,
    features: ["Up to 3 tills", "Everything in Basic", "Kitchen display or live stock control", "Staff logins & permissions", "Phone support, 7 days"],
    cta: "Subscribe now",
    popular: true,
  },
  {
    id: "premium",
    name: "Premium",
    tagline: "For multi-site and high-volume businesses.",
    monthly: 60.99,
    annual: 699,
    features: ["Unlimited tills", "Everything in Standard", "Multi-site reporting & central menus", "Supplier ordering & integrations", "Priority support & account manager"],
    cta: "Choose Premium",
  },
];

export function getPlan(id: unknown) {
  return PLANS.find((p) => p.id === id);
}

export function parseBilling(value: unknown): Billing {
  return value === "annual" ? "annual" : "monthly";
}

// "£35.99" / "£399" — whole pounds drop the pence.
export function formatPlanPrice(amount: number) {
  return `£${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

// "Standard · £45.99 / month" — how a chosen plan is shown on the brief and in Super Admin.
export function planLabel(id: unknown, billing: unknown) {
  const plan = getPlan(id);
  if (!plan) return "";
  const b = parseBilling(billing);
  return `${plan.name} · ${formatPlanPrice(b === "annual" ? plan.annual : plan.monthly)} / ${b === "annual" ? "year" : "month"}`;
}
