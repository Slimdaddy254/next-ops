/**
 * Sanitize user input to prevent XSS attacks
 */
export function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

/**
 * Sanitize object properties recursively
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = sanitizeHtml(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === "string"
          ? sanitizeHtml(item)
          : typeof item === "object" && item !== null
          ? sanitizeObject(item as Record<string, unknown>)
          : item
      );
    } else if (typeof value === "object" && value !== null) {
      result[key] = sanitizeObject(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

/**
 * Validate that a string doesn't contain potential XSS vectors
 */
export function containsXss(input: string): boolean {
  const xssPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /data:/gi,
    /vbscript:/gi,
  ];

  return xssPatterns.some((pattern) => pattern.test(input));
}

/**
 * Strip all HTML tags from input
 */
export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}

/**
 * Security headers for API responses
 */
export const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';",
};

/**
 * CSRF Protection for API routes
 * Validates that the request originates from the same origin
 */
export function validateCsrf(request: Request): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");

  // Allow requests without origin (same-origin requests from some browsers)
  if (!origin && !referer) {
    // Check for custom header that JS must set (defense in depth)
    const customHeader = request.headers.get("x-requested-with");
    return customHeader === "XMLHttpRequest" || customHeader === "fetch";
  }

  // Validate origin matches host
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const expectedHosts = [host, "localhost:3000", "localhost:3001"];
      return expectedHosts.some(h => originUrl.host === h);
    } catch {
      return false;
    }
  }

  // Validate referer matches host
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const expectedHosts = [host, "localhost:3000", "localhost:3001"];
      return expectedHosts.some(h => refererUrl.host === h);
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Helper to check CSRF and return 403 if invalid
 */
export function requireCsrf(request: Request): Response | null {
  // Skip CSRF for GET, HEAD, OPTIONS (safe methods)
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    return null;
  }

  if (!validateCsrf(request)) {
    return new Response(JSON.stringify({ error: "CSRF validation failed" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return null;
}
