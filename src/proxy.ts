import { NextResponse, type NextRequest } from "next/server";
import { IMPERSONATION_COOKIE_NAME, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

const PUBLIC_PATHS = ["/login"];

// Pages only an admin (or an impersonating super admin) may reach — staff are blocked.
const ADMIN_ONLY_PREFIXES = ["/manage-dishes", "/settings", "/reports", "/pricing"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    /\.(svg|png|jpg|jpeg|ico|webp)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (isPublic(pathname)) {
    if (session && pathname === "/login") {
      return NextResponse.redirect(new URL(session.role === "super_admin" ? "/super-admin" : "/dashboard", request.url));
    }
    return NextResponse.next();
  }

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
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
