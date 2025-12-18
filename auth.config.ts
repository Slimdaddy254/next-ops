import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const pathname = nextUrl.pathname;

      // Public paths that don't require auth
      const publicPaths = ["/login", "/signup", "/"];
      const isPublicPath = publicPaths.some((path) => pathname === path);

      // API routes are handled separately
      if (pathname.startsWith("/api/")) {
        return true; // Let API routes handle their own auth
      }

      // Tenant routes require authentication
      if (pathname.startsWith("/t/")) {
        if (!isLoggedIn) {
          return false; // Redirect to login
        }
        return true;
      }

      // Allow public paths
      if (isPublicPath) {
        return true;
      }

      // Default: require auth
      return isLoggedIn;
    },
  },
  providers: [], // Providers are in auth.ts
};
