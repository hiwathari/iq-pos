import { NextResponse, type NextRequest } from "next/server";
import { IMPERSONATION_COOKIE_NAME, SESSION_COOKIE_NAME, verifySessionToken, type Role } from "@/lib/session";
import { getRestaurantByCustomDomain, getRestaurantBySlug } from "@/lib/data/restaurants";
import { landingFor } from "@/lib/device";
import { getKillState, isBlocked } from "@/lib/kill-switch";

const PUBLIC_PATHS = ["/login", "/till-login", "/kitchen-login", "/staff-login"];

// Customer-facing pages that don't use the staff/admin session below — /my-card and /order use
// their own session cookie (see src/lib/loyalty-session.ts), checked per-page; /invoice/[orderId]
// needs no session at all, gated only by knowing the order's unguessable id. /get and /downloads
// are the public Till-APK download page and the static .apk file it links to — reachable from a
// bare Sunmi device browser with no session at all, same reasoning. Also reachable from a
// restaurant's custom ordering domain, rewritten in here — see resolveCustomDomain.
const CUSTOMER_FACING_PREFIXES = ["/my-card", "/order", "/invoice", "/get", "/downloads", "/site", "/faq", "/api/site"];

// The IQ marketing site (iq.luvder.com — and iq.localhost for local testing) is the same app,
// served from /site: "/" → /site, "/build" → /site/build, and so on. /faq, /api and static files
// are shared with the POS host and pass through untouched.
function isSiteHost(hostname: string) {
  return hostname === "iq.luvder.com" || hostname === "iq.localhost";
}

function rewriteSiteHost(request: NextRequest) {
  const hostname = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  if (!isSiteHost(hostname)) return null;
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/site") || pathname.startsWith("/api") || pathname.startsWith("/faq")) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = `/site${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

// Proxy defaults to the Node.js runtime in Next.js 16 (not Edge), so a real DB lookup here is
// fine — this only ever runs for a Host header that isn't the platform's own domain, i.e. almost
// never, so it adds no per-request cost to normal traffic.
function isKnownAppHost(hostname: string) {
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  if (hostname.endsWith(".vercel.app")) return true;
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    try {
      if (hostname === new URL(configured).hostname.toLowerCase()) return true;
    } catch {
      // ignore a malformed env value
    }
  }
  return false;
}

// A request arriving on a restaurant's own custom ordering domain (anything that isn't the
// platform's own domain) is that restaurant's public order page by default — rewritten internally
// to /order/<slug>/..., transparent to the visitor's address bar. /my-card and /invoice are left
// alone: they're already fully self-contained (a session cookie or an id in the path, never a
// slug), not nested under /order/<slug> — and a magic-link email now legitimately points straight
// at a custom domain's /my-card/verify (see createSignInRequest), so that needs to reach the real
// route unprefixed. A path that's already /order/<slug>/... (e.g. the redirect verify lands on
// after sign-in) is left alone too, or it would get the slug prefixed on a second time.
async function resolveCustomDomain(request: NextRequest) {
  const host = request.headers.get("host");
  if (!host) return null;
  const hostname = host.split(":")[0].toLowerCase();
  if (isKnownAppHost(hostname)) return null;

  const restaurant = await getRestaurantByCustomDomain(hostname);
  if (!restaurant || !restaurant.onlineOrderingEnabled) return null;

  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/my-card") ||
    pathname.startsWith("/invoice") ||
    pathname.startsWith("/get") ||
    pathname.startsWith("/downloads") ||
    pathname.startsWith(`/order/${restaurant.slug}`)
  ) {
    return null;
  }

  const url = request.nextUrl.clone();
  url.pathname = `/order/${restaurant.slug}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p);
}

function homeFor(role: Role, userAgent: string | null) {
  return landingFor(role, userAgent);
}

// Is this request for a switched-off business's public pages — /order/<slug>/... or its own custom domain?
async function publicPageSwitchedOff(request: NextRequest, off: Record<string, string>) {
  const { pathname } = request.nextUrl;
  const hostname = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  try {
    if (pathname.startsWith("/order/")) {
      const slug = pathname.split("/")[2];
      const restaurant = slug ? await getRestaurantBySlug(slug) : null;
      if (restaurant && off[restaurant.id]) return true;
    } else if (hostname && !isKnownAppHost(hostname) && !isSiteHost(hostname)) {
      const restaurant = await getRestaurantByCustomDomain(hostname);
      if (restaurant && off[restaurant.id]) return true;
    }
  } catch {
    // lookup failed — fail open
  }
  return false;
}

// What everyone sees while the Super Admin kill switch is on. Browsers navigating get a plain page;
// fetches, server actions and API callers get JSON. Never cached.
function killSwitchResponse(request: NextRequest) {
  const headers = { "Cache-Control": "no-store", "Retry-After": "300" };
  const wantsHtml =
    request.method === "GET" && (request.headers.get("accept") ?? "").includes("text/html") && !request.headers.get("rsc");
  if (!wantsHtml) {
    return NextResponse.json({ error: "The system is switched off. Please try again later." }, { status: 503, headers });
  }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Switched off</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#fafafa;font-family:system-ui,sans-serif;color:#171717}main{max-width:26rem;padding:2rem;text-align:center}h1{font-size:1.25rem;margin:0 0 .5rem}p{color:#525252;margin:0 0 1rem;line-height:1.5}a{color:#a3a3a3;font-size:.8rem}</style></head><body><main><h1>The system is switched off</h1><p>This service is temporarily unavailable. Please try again later.</p><a href="/login">Platform owner sign-in</a></main></body></html>`;
  return new NextResponse(html, { status: 503, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    /\.(svg|png|jpg|jpeg|ico|webp|webmanifest)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Kill switches: the whole platform (Super Admin) and individual businesses (that business's admin, or
  // Super Admin). While one applies to a request, nothing works except the /login page and Super Admin
  // sessions — see lib/kill-switch.ts for who is let through.
  const kill = await getKillState();
  const businessesOff = Object.keys(kill.restaurants).length > 0;
  if (kill.global || businessesOff) {
    const killToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const killSession = killToken ? await verifySessionToken(killToken) : null;
    if (killSession?.role !== "super_admin") {
      let blocked = false;
      if (killSession) {
        // A regional admin works inside a business through the "manage as" cookie.
        const restaurantId =
          killSession.restaurantId ??
          (killSession.role === "regional_admin" ? (request.cookies.get(IMPERSONATION_COOKIE_NAME)?.value ?? null) : null);
        blocked = isBlocked(kill, { role: killSession.role, restaurantId });
      } else {
        blocked = kill.global;
      }
      // A switched-off business's public pages (online ordering, its own domain) are off for customers too.
      if (!blocked && businessesOff && (await publicPageSwitchedOff(request, kill.restaurants))) blocked = true;
      if (blocked) {
        if (pathname === "/login") {
          // Let people reach the sign-in form; a blocked session on this browser is dropped so it can't keep
          // the form from loading.
          const res = NextResponse.next();
          if (killSession) res.cookies.delete(SESSION_COOKIE_NAME);
          return res;
        }
        return killSwitchResponse(request);
      }
    }
  }

  // API routes sit outside everything below (they weren't matched at all before the kill switch widened
  // the matcher) — they do their own auth.
  if (pathname.startsWith("/api")) return NextResponse.next();

  const siteRewrite = rewriteSiteHost(request);
  if (siteRewrite) return siteRewrite;

  const customDomainRewrite = await resolveCustomDomain(request);
  if (customDomainRewrite) return customDomainRewrite;

  if (CUSTOMER_FACING_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (isPublic(pathname)) {
    if (session) {
      return NextResponse.redirect(new URL(homeFor(session.role, request.headers.get("user-agent")), request.url));
    }
    return NextResponse.next();
  }

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (session.role === "till" && pathname !== "/order-line") {
    return NextResponse.redirect(new URL("/order-line", request.url));
  }

  if (session.role === "kitchen_display" && pathname !== "/kitchen") {
    return NextResponse.redirect(new URL("/kitchen", request.url));
  }

  const isSuperAdminPath = pathname.startsWith("/super-admin");
  const isSuperOrRegional = session.role === "super_admin" || session.role === "regional_admin";

  if (isSuperAdminPath && !isSuperOrRegional) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (!isSuperAdminPath && isSuperOrRegional) {
    const impersonating = request.cookies.get(IMPERSONATION_COOKIE_NAME)?.value;
    if (!impersonating) {
      return NextResponse.redirect(new URL("/super-admin", request.url));
    }
  }

  // Per-page access for "staff" (which admin-only sections they can reach, e.g. Reports,
  // Settings, Manage Dishes) is enforced server-side by requirePermission() in each page, not
  // here — permissions live in the database and this middleware runs on the edge without a DB
  // round trip, so it can't know a given staff member's grants without one.

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
