import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ACCESS_COOKIE_NAME = "access_token";
const AUTH_MARKER_COOKIE = "dashboard_auth";

export function proxy(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE_NAME)?.value;
  const authMarker = request.cookies.get(AUTH_MARKER_COOKIE)?.value;
  const isAuthenticated = Boolean(accessToken || authMarker);

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
