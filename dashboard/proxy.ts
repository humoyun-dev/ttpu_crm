import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next.js 16 uses the "proxy" file/export convention (formerly "middleware").
// Gate on the non-httpOnly `dashboard_auth` marker cookie that the dashboard
// sets on its OWN origin (api.ts persistTokens) — the access_token/refresh_token
// cookies are httpOnly and live on the API origin, so they are NOT visible here.
const AUTH_MARKER_COOKIE = "dashboard_auth";

export function proxy(request: NextRequest) {
  const isAuthenticated = Boolean(
    request.cookies.get(AUTH_MARKER_COOKIE)?.value,
  );

  const pathname = request.nextUrl.pathname;
  const isLoginPage = pathname === "/login";
  const isDashboardRoute = pathname.startsWith("/dashboard");

  if (isAuthenticated && isLoginPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (!isAuthenticated && isDashboardRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/dashboard/:path*"],
};
