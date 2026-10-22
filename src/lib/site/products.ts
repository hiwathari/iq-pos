// The IQ product family shown on the marketing site (iq.luvder.com): the Product menu, the home
// page grid and each /products/<slug> page all read from this one list. `status` is honest about
// what ships today — "live" features exist in the POS now, "early" is taken on by our team via
// the /build brief, "soon" is a waitlist only.

export type ProductStatus = "live" | "early" | "soon";

export type ProductIcon =
  | "sparkles"
  | "box"
  | "smartphone"
  | "calendar"
  | "heart"
  | "gift"
  | "instagram"
  | "search"
  | "bot"
  | "receipt";

export interface ProductPoint {
  title: string;
  body: string;
  soon?: boolean;
}

export interface Product {
  slug: string;
  name: string;
  tagline: string;
  status: ProductStatus;
  icon: ProductIcon;
  headline: string;
  intro: string;
  points: ProductPoint[];
  // Screenshots under /site/shots — the first is the page's hero image.
  shots: { src: string; alt: string; phone?: boolean }[];
  // Words in a /build description that suggest the sender wants this product.
  keywords: string[];
}

export const PRODUCTS: Product[] = [
  {
    slug: "ai-website",
    name: "AI Website",
    tagline: "Generate & host",
    status: "early",
    icon: "sparkles",
    headline: "Describe your restaurant. Get a website back.",
    intro:
      "Write a few lines about your place and drop in your logo and menu. IQ reads them, fills in the details for you and asks only for what's missing — then we build, host and connect the site to your ordering.",
    points: [
      { title: "Start with a few sentences", body: "Say what you cook, where you are and the feel you want. That's enough to begin." },
      { title: "Details pulled out for you", body: "Name, address, phone, opening hours, colours from your logo and dishes from your menu PDF." },
      { title: "Hosted on your own domain", body: "Use the domain you already have, or start on a free IQ address and switch later." },
      { title: "Menu stays in sync", body: "Dishes and prices come from your IQ POS menu, so the website never shows last year's prices." },
      { title: "Order and book from the site", body: "Your online ordering and table QR codes plug straight in." },
    ],
    shots: [],
    keywords: ["website", "site", "web page", "webpage", "domain", "online presence"],
  },
  {
    slug: "ar-menu",
    name: "AR Menu",
    tagline: "3D dishes & photo cards",
    status: "soon",
    icon: "box",
    headline: "Let guests see the dish before they order it.",
    intro: "Turn your best sellers into 3D models and photo cards that open from the menu on any phone — no app to download.",
    points: [
      { title: "3D dishes on the table", body: "Guests point their phone and see the plate at real size." },
      { title: "Photo cards for every item", body: "Clean, consistent photos with the price and allergens." },
      { title: "Works from your QR codes", body: "Opens from the same table codes guests already scan." },
    ],
    shots: [],
    keywords: ["ar ", "augmented", "3d", "photo card", "photos of dishes"],
  },
  {
    slug: "customer-app",
    name: "Customer App",
    tagline: "Order & pay at the table",
    status: "live",
    icon: "smartphone",
    headline: "Every table becomes a place to order.",
    intro:
      "Print a code for each table. Guests scan it with their phone camera, pick their dishes and send the order — no app, no account, no waving for attention.",
    points: [
      { title: "A signed code per table", body: "The table number is locked in, so nobody can send an order to another table." },
      { title: "Nothing to install", body: "The menu opens in the phone's browser with your logo and colours." },
      { title: "Your staff stay in control", body: "Orders light up the Till and only reach the kitchen once someone accepts them." },
      { title: "Online ordering too", body: "The same menu works as your pickup and delivery ordering link, on your own domain." },
      { title: "Pay at the table", body: "Guests settle the bill from their phone.", soon: true },
    ],
    shots: [
      { src: "/site/shots/phone-menu.webp", alt: "The menu on a guest's phone with the table already set", phone: true },
      { src: "/site/shots/phone-checkout.webp", alt: "Checkout asking for a name and an email or phone number", phone: true },
      { src: "/site/shots/online.webp", alt: "Guest orders waiting to be accepted on the Till's Online tab" },
    ],
    keywords: ["qr", "order online", "online order", "ordering", "takeaway", "delivery", "collection", "app", "pay at the table"],
  },
  {
    slug: "table-booking",
    name: "Table Booking",
    tagline: "Floor plan + iPad",
    status: "live",
    icon: "calendar",
    headline: "Your whole floor, live on one screen.",
    intro: "See which tables are free, who's seated and for how long. Take bookings, seat walk-ins and move parties around from an iPad at the door.",
    points: [
      { title: "Floor plan by area", body: "Ground floor, upstairs, basement — each table with its seats and status." },
      { title: "Time seated, at a glance", body: "Know which tables are about to turn without walking the room." },
      { title: "Move, merge and free tables", body: "One tap to free a table, or all of them at closing time." },
      { title: "Reservations", body: "Phone and walk-in bookings with party size and time." },
      { title: "Book from your website", body: "Guests choose a time online and it lands on the floor plan.", soon: true },
    ],
    shots: [{ src: "/site/shots/tables.webp", alt: "The Tables view showing seated and free tables" }],
    keywords: ["book", "booking", "reservation", "reserve", "tables"],
  },
  {
    slug: "loyalty",
    name: "Loyalty",
    tagline: "Stamps, points, perks",
    status: "live",
    icon: "heart",
    headline: "Bring regulars back without a paper card.",
    intro: "Guests get a digital loyalty card on their phone. Staff find it on the Till by phone number or email and apply perks in a tap.",
    points: [
      { title: "A card in their pocket", body: "Each member gets a QR card they can open any time — no app." },
      { title: "Found in seconds", body: "Search by phone or email from the Till while you're taking the order." },
      { title: "Coupons and codes", body: "Run a discount code for a quiet Tuesday and see how many used it." },
      { title: "Stamps and points", body: "Every tenth coffee free, or points that add up to a perk.", soon: true },
    ],
    shots: [],
    keywords: ["loyalty", "stamp", "points", "rewards", "regulars"],
  },
  {
    slug: "gift-cards",
    name: "Gift Cards",
    tagline: "Branded, digital, instant",
    status: "soon",
    icon: "gift",
    headline: "Sell gift cards while you sleep.",
    intro: "Branded digital gift cards that customers buy from your website and send by email in seconds. Redeem them on the Till.",
    points: [
      { title: "In your colours", body: "Your logo and brand on every card." },
      { title: "Bought online, sent instantly", body: "Perfect for last-minute birthdays." },
      { title: "Balance tracked on the Till", body: "Use part of a card now and the rest next time." },
    ],
    shots: [],
    keywords: ["gift card", "voucher", "gift voucher"],
  },
  {
    slug: "social-hub",
    name: "Social Hub",
    tagline: "Insta bio link, one tap",
    status: "soon",
    icon: "instagram",
    headline: "One link in your bio that does everything.",
    intro: "A fast page for your Instagram and TikTok bio with your menu, ordering, booking and today's specials — always up to date.",
    points: [
      { title: "Order and book in one tap", body: "Followers go straight from a post to an order." },
      { title: "Today's specials", body: "Update once on the POS, show everywhere." },
      { title: "See what converts", body: "Which posts actually bring orders in." },
    ],
    shots: [],
    keywords: ["tiktok", "social media", "bio link", "link in bio"],
  },
  {
    slug: "agentic-seo",
    name: "Agentic SEO",
    tagline: "Rank on Google, hands-free",
    status: "soon",
    icon: "search",
    headline: "Show up when people search for food near them.",
    intro: "An AI agent keeps your Google profile, menu pages and opening hours tidy and current, so you climb local search without hiring an agency.",
    points: [
      { title: "Google profile kept current", body: "Hours, photos and menu checked every week." },
      { title: "Pages written for search", body: "Dish and cuisine pages people actually look for." },
      { title: "A monthly plain-English report", body: "What moved, and what to do next." },
    ],
    shots: [],
    keywords: ["seo", "google", "search", "rank"],
  },
  {
    slug: "geo",
    name: "GEO",
    tagline: "Be cited by ChatGPT",
    status: "soon",
    icon: "bot",
    headline: "Be the answer when someone asks an AI where to eat.",
    intro: "Generative engine optimisation: structured, accurate information about your restaurant that AI assistants can read, trust and recommend.",
    points: [
      { title: "Readable by AI assistants", body: "Your menu, hours and story in the formats they use." },
      { title: "Accurate everywhere", body: "One source of truth, published from your POS." },
      { title: "Track mentions", body: "See when assistants recommend you." },
    ],
    shots: [],
    keywords: ["chatgpt", "ai search", "geo", "gemini", "perplexity"],
  },
  {
    slug: "pos",
    name: "POS",
    tagline: "Orders, payments & receipts",
    status: "live",
    icon: "receipt",
    headline: "A till your team learns in one shift.",
    intro:
      "Built for touch screens at the counter. Take an order in a few taps, send it to the kitchen, take cash or card and close the day knowing every penny balances.",
    points: [
      { title: "One tap per dish", body: "Big, clear buttons for the busiest moments. Mark sold out in a tap." },
      { title: "Every way people order", body: "Dine in, wait list, takeaway, delivery, online and delivery apps." },
      { title: "Split cash and card", body: "Any mix of cash and card machines — change is worked out for you." },
      { title: "Kitchen Display", body: "Tickets arrive instantly, oldest first, with timers that turn amber then red." },
      { title: "An End Day that balances", body: "Count the drawer and each card machine and see exactly what's out." },
      { title: "Reports and staff PINs", body: "Sales by day, channel and staff. Everyone signs in with their own PIN." },
    ],
    shots: [
      { src: "/site/shots/till.webp", alt: "The Till with an order on the right and the menu on the left" },
      { src: "/site/shots/kitchen.webp", alt: "The Kitchen Display with tickets and timers" },
      { src: "/site/shots/reports.webp", alt: "Reports showing sales by channel and payment" },
    ],
    keywords: ["pos", "till", "epos", "card machine", "payments", "receipt", "kitchen display"],
  },
];

export const STATUS_LABEL: Record<ProductStatus, string> = {
  live: "Live",
  early: "Early access",
  soon: "Coming soon",
};

export function getProduct(slug: string) {
  return PRODUCTS.find((p) => p.slug === slug) ?? null;
}
