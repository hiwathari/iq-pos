import { NextResponse, type NextRequest } from "next/server";
import { IMPERSONATION_COOKIE_NAME, SESSION_COOKIE_NAME, verifySessionToken, type Role } from "@/lib/session";
import { getRestaurantByCustomDomain } from "@/lib/data/restaurants";

const PUBLIC_PATHS = ["/login", "/till-login", "/kitchen-login"];

// Customer-facing pages that use their own session cookie (see src/lib/loyalty-session.ts),
// checked per-page — never the staff/admin session below. Also reachable from a restaurant's
// custom ordering domain, rewritten in here — see resolveCustomDomain.
const CUSTOMER_FACING_PREFIXES = ["/my-card", "/order"];

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
// platform's own domain) is always that restaurant's public order page — rewritten internally to
// /order/<slug>/..., transparent to the visitor's address bar.
async function resolveCustomDomain(request: NextRequest) {
  const host = request.headers.get("host");
  if (!host) return null;
  const hostname = host.split(":")[0].toLowerCase();
  if (isKnownAppHost(hostname)) return null;

  const restaurant = await getRestaurantByCustomDomain(hostname);
  if (!restaurant || !restaurant.onlineOrderingEnabled) return null;

  const url = request.nextUrl.clone();
  url.pathname = `/order/${restaurant.slug}${url.pathname === "/" ? "" : url.pathname}`;
  return NextResponse.rewrite(url);
}

// Pages only an admin (or an impersonating super admin) may reach — staff are blocked.
const ADMIN_ONLY_PREFIXES = ["/manage-dishes", "/settings", "/reports", "/pricing", "/shift-report", "/coupons", "/loyalty", "/inventory"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p);
}

function homeFor(role: Role) {
  if (role === "super_admin") return "/super-admin";
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

  if (isSuperAdminPath && session.role !== "super_admin") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (!isSuperAdminPath && session.role === "super_admin") {
    const impersonating = request.cookies.get(IMPERSONATION_COOKIE_NAME)?.value;
    if (!impersonating) {
      return NextResponse.redirect(new URL("/super-admin", request.url));
    }
  }

  if (session.role === "staff" && ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
