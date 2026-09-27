import { NextResponse, type NextRequest } from "next/server";
import { IMPERSONATION_COOKIE_NAME, SESSION_COOKIE_NAME, verifySessionToken, type Role } from "@/lib/session";

const PUBLIC_PATHS = ["/login", "/till-login", "/kitchen-login"];

// Customer-facing loyalty sign-in + account pages use their own session cookie (see
// src/lib/loyalty-session.ts), checked per-page — never the staff/admin session below.
const CUSTOMER_FACING_PREFIX = "/my-card";

// Pages only an admin (or an impersonating super admin) may reach — staff are blocked.
const ADMIN_ONLY_PREFIXES = ["/manage-dishes", "/settings", "/reports", "/pricing", "/shift-report", "/coupons", "/loyalty"];

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
    pathname.startsWith(CUSTOMER_FACING_PREFIX) ||
    /\.(svg|png|jpg|jpeg|ico|webp|webmanifest)$/.test(pathname)
  ) {
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
