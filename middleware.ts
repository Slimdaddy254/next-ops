import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Extract tenant slug from URL pattern: /t/[tenantSlug]/...
  const tenantMatch = pathname.match(/^\/t\/([^\/]+)/);
  
  if (tenantMatch) {
    const tenantSlug = tenantMatch[1];
    
    // Add tenant context to request headers for access in server components
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-tenant-slug", tenantSlug);
    
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - login, signup (public auth pages)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|login|signup).*)",
  ],
};
