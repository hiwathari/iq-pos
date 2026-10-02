import { NextResponse, type NextRequest } from "next/server";
import { IMPERSONATION_COOKIE_NAME, SESSION_COOKIE_NAME, verifySessionToken, type Role } from "@/lib/session";
import { getRestaurantByCustomDomain } from "@/lib/data/restaurants";

const PUBLIC_PATHS = ["/login", "/till-login", "/kitchen-login", "/staff-login"];

// Customer-facing pages that don't use the staff/admin session below — /my-card and /order use
// their own session cookie (see src/lib/loyalty-session.ts), checked per-page; /invoice/[orderId]
// needs no session at all, gated only by knowing the order's unguessable id. Also reachable from a
// restaurant's custom ordering domain, rewritten in here — see resolveCustomDomain.
const CUSTOMER_FACING_PREFIXES = ["/my-card", "/order", "/invoice"];

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
  if (pathname.startsWith("/my-card") || pathname.startsWith("/invoice") || pathname.startsWith(`/order/${restaurant.slug}`)) {
    return null;
  }

  const url = request.nextUrl.clone();
  url.pathname = `/order/${restaurant.slug}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p);
}

function homeFor(role: Role) {
  if (role === "super_admin" || role === "regional_admin") return "/super-admin";
  if (role === "till") return "/order-line";
  if (role === "kitchen_display") return "/kitchen";
  return "/dashboard";
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

  const customDomainRewrite = await resolveCustomDomain(request);
  if (customDomainRewrite) return customDomainRewrite;

  if (CUSTOMER_FACING_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (isPublic(pathname)) {
    if (session) {
      return NextResponse.redirect(new URL(homeFor(session.role), request.url));
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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
