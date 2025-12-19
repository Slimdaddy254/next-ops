# Next Ops

A multi-tenant incident management and feature flag platform built with Next.js 16, PostgreSQL, and Prisma.

![Dashboard Screenshot](.github/dashboard.png)

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture Overview](#architecture-overview)
- [Multi-Tenant Architecture & Tenant Enforcement](#multi-tenant-architecture--tenant-enforcement)
- [Caching & Invalidation Strategy](#caching--invalidation-strategy)
- [Realtime Design](#realtime-design)
- [Security Decisions](#security-decisions)
- [Tradeoffs & Next Steps](#tradeoffs--next-steps)

---

## Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- PostgreSQL 15+ (or use Docker)

### Development Setup

```bash
# 1. Clone and install dependencies
git clone https://github.com/Slimdaddy254/next-ops.git
cd next-ops
npm install

# 2. Start PostgreSQL with Docker
docker-compose up postgres -d

# 3. Set up environment variables
cp .env.example .env.local

# 4. Run database migrations and seed data
npx prisma migrate deploy
npx prisma db seed

# 5. Start the development server
npm run dev
```

### Docker Compose (Full Stack)

```bash
docker-compose up --build
```

This starts both PostgreSQL and the Next.js application, runs migrations, seeds the database, and exposes the app at `http://localhost:3000`.

### Running Tests

```bash
npm test           # Run all tests
npm run test:unit  # Unit tests only
npm run test:int   # Integration tests only
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Next.js App Router                       │
├──────────────────────┬──────────────────────────────────────────┤
│   Client Components  │           Server Components               │
│   - Incident List    │           - Layout with Auth              │
│   - Feature Flags UI │           - Dashboard Stats               │
│   - Realtime Updates │           - Initial Data Fetch            │
├──────────────────────┴──────────────────────────────────────────┤
│                        API Routes (/api/*)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  Incidents   │  │Feature Flags │  │  Audit/Jobs/etc.     │   │
│  │  CRUD + SSE  │  │  + Evaluate  │  │                      │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                     Tenant Context Layer                          │
│    getCurrentTenantContext() → Session → tenantId enforcement    │
├─────────────────────────────────────────────────────────────────┤
│                        Prisma ORM                                 │
│     All queries explicitly filtered by tenantId                  │
├─────────────────────────────────────────────────────────────────┤
│                        PostgreSQL                                 │
│  Tenant │ User │ Membership │ Incident │ FeatureFlag │ AuditLog │
└─────────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Purpose |
|-----------|---------|
| `lib/tenant.ts` | Tenant context management and enforcement |
| `lib/auth.ts` | Session management with iron-session |
| `lib/prisma.ts` | Database client with tenant-aware utilities |
| `lib/audit-log.ts` | Mutation logging for compliance |
| `lib/feature-flags.ts` | Deterministic flag evaluation engine |
| `lib/job-queue.ts` | Database-backed background jobs |
| `lib/rate-limit.ts` | In-memory rate limiting |
| `lib/security.ts` | XSS prevention and CSRF protection |

---

## Multi-Tenant Architecture & Tenant Enforcement

### Data Model

```
Tenant (1) ──────< Membership >────── (N) User
   │                                        │
   ├── Incident (tenantId)                  │
   ├── FeatureFlag (tenantId)               │
   ├── AuditLog (tenantId)                  │
   └── Job (tenantId)                       │
                                            │
User ─< SavedView (tenantId + userId) >─────┘
```

- **Users can belong to multiple tenants** via the `Membership` table
- **Every data entity includes a `tenantId`** foreign key
- **Tenant context is established via URL**: `/t/[tenantSlug]/...`

### Tenant Enforcement Strategy

**1. Session-Based Context**

```typescript
// lib/tenant.ts
export async function getCurrentTenantContext() {
  const session = await getSession();
  if (!session.tenantId || !session.tenantSlug) {
    return null;
  }
  return {
    tenantId: session.tenantId,
    tenantSlug: session.tenantSlug,
  };
}
```

**2. Explicit Query Filtering (Data Access Layer)**

Every database query explicitly includes `tenantId`:

```typescript
// Example: Fetching incidents
const incidents = await prisma.incident.findMany({
  where: {
    tenantId: tenantContext.tenantId, // Always required
    status: filters.status,
    // ... other filters
  },
});
```

**3. Route Protection**

The layout at `/app/t/[tenantSlug]/layout.tsx` validates tenant access before rendering children:

```typescript
// Verify user has membership in this tenant
const membership = await prisma.membership.findFirst({
  where: { userId: session.user.id, tenant: { slug: tenantSlug } },
});
if (!membership) redirect("/");
```

**4. API Route Enforcement**

Every API route follows this pattern:

```typescript
export async function GET(request: NextRequest) {
  const session = await getSession();
  const tenantContext = await getCurrentTenantContext();

  if (!session.user || !tenantContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // All queries scoped to tenantContext.tenantId
}
```

### Why Not Prisma Middleware?

We chose **explicit tenant filtering** over automatic Prisma middleware because:

1. **Visibility**: Engineers see the tenant scope in every query
2. **Testability**: No magic—easy to test tenant isolation
3. **Flexibility**: Some admin operations may need cross-tenant access
4. **Debugging**: Clear stack traces when tenant context is missing

---

## Caching & Invalidation Strategy

### Current Approach: Request-Level Caching Only

This application **intentionally avoids aggressive caching** to prioritize data freshness in an incident management context. Users expect to see the latest status immediately.

**What We Do:**

| Layer | Strategy |
|-------|----------|
| **Client** | `useState`/`useEffect` for component state; refetch on visibility change |
| **Server Components** | Fresh data on each request (no `cache: 'force-cache'`) |
| **API Routes** | No HTTP caching headers for mutable data |
| **Prisma** | Connection pooling only (no query result cache) |

**Visibility-Based Refetch:**

```typescript
// Incidents list page refetches when tab becomes visible
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      fetchIncidents();
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
}, []);
```

### Feature Flags: Deterministic Evaluation

Feature flag evaluations are **deterministic** via stable hashing, eliminating the need for caching:

```typescript
export function stableHash(userId: string, flagKey: string): number {
  const hash = createHash("sha256");
  hash.update(`${userId}:${flagKey}`);
  const hex = hash.digest("hex");
  return parseInt(hex.substring(0, 8), 16) % 100;
}
```

Same `userId + flagKey` always produces the same bucket (0-99), ensuring consistent rollout behavior.

### Future Caching Considerations

If scale requires it, consider:

1. **Redis** for rate limiting and session storage
2. **SWR/React Query** with short TTL for read-heavy lists
3. **Prisma Accelerate** for edge query caching
4. **Incremental Static Regeneration** for dashboard stats

---

## Realtime Design

### Architecture: Server-Sent Events (SSE)

We chose SSE over WebSockets for incident detail pages because:

| SSE | WebSockets |
|-----|------------|
| HTTP-based, works through proxies | Requires protocol upgrade |
| Automatic reconnection | Manual reconnection handling |
| Simpler server implementation | Bidirectional (not needed here) |
| Native browser support | Similar support |

### Implementation

**Server (API Route):**

```typescript
// /api/incidents/[id]/stream/route.ts
export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection event
      controller.enqueue(encoder.encode(`event: connected\ndata: {}\n\n`));
      
      // Poll for updates (production: use pub/sub)
      const interval = setInterval(async () => {
        const incident = await prisma.incident.findFirst({ ... });
        controller.enqueue(
          encoder.encode(`event: update\ndata: ${JSON.stringify(incident)}\n\n`)
        );
      }, 5000);
      
      // Cleanup on close
      request.signal.addEventListener('abort', () => clearInterval(interval));
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

**Client:**

```typescript
useEffect(() => {
  const eventSource = new EventSource(`/api/incidents/${id}/stream`);
  
  eventSource.addEventListener('update', (event) => {
    const updated = JSON.parse(event.data);
    setIncident(updated);
  });
  
  eventSource.onerror = () => setIsConnected(false);
  
  return () => eventSource.close();
}, [id]);
```

### Authentication & Tenant Scoping

SSE connections are authenticated:

```typescript
const session = await getSession();
const tenantContext = await getCurrentTenantContext();

if (!session.user || !tenantContext) {
  return new Response('Unauthorized', { status: 401 });
}

// Stream only sends data for incidents in user's tenant
```

### Scaling Considerations

Current polling-based SSE works for moderate scale. For production:

1. **Redis Pub/Sub**: Publish incident changes, subscribe in SSE streams
2. **Ably/Pusher**: Managed realtime with presence and history
3. **WebSocket Upgrade**: If bidirectional communication becomes needed

---

## Security Decisions

### 1. Authentication: Iron-Session (Cookie-Based)

```typescript
const SESSION_CONFIG = {
  password: process.env.NEXTAUTH_SECRET, // 32+ chars
  cookieName: "ops_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60, // 7 days
    sameSite: "lax",
  },
};
```

**Why iron-session?**
- Encrypted cookies, no session store needed
- Works with edge runtimes
- Simple API for Next.js

### 2. Password Hashing: bcrypt

```typescript
import { hash, compare } from 'bcrypt';
const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, SALT_ROUNDS);
}
```

### 3. XSS Prevention

All user-generated content is sanitized:

```typescript
export function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}
```

### 4. CSRF Protection

Origin validation for mutating requests:

```typescript
export function validateCsrf(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  
  if (!origin || !host) return false;
  
  const originUrl = new URL(origin);
  return originUrl.host === host;
}
```

### 5. Rate Limiting

In-memory rate limiter with separate limits for reads and writes:

```typescript
// Read operations: 100 req/min
export function rateLimitRead(identifier: string) {
  return checkRateLimit(`read:${identifier}`, { windowMs: 60000, maxRequests: 100 });
}

// Write operations: 30 req/min
export function rateLimitWrite(identifier: string) {
  return checkRateLimit(`write:${identifier}`, { windowMs: 60000, maxRequests: 30 });
}
```

### 6. Audit Logging

Every mutation is logged:

```typescript
await createAuditLog({
  tenantId: tenantContext.tenantId,
  actorId: session.user.id,
  action: "UPDATE",
  entityType: "Incident",
  entityId: incident.id,
  beforeData: originalIncident,
  afterData: updatedIncident,
});
```

### 7. Security Headers

```typescript
export const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": "default-src 'self'; ...",
};
```

---

## Tradeoffs & Next Steps

### Current Tradeoffs

| Decision | Tradeoff | Rationale |
|----------|----------|-----------|
| **Explicit tenant filtering** | More boilerplate per query | Clear, testable, no hidden behavior |
| **In-memory rate limiting** | Lost on restart, no cluster support | Simplicity; Redis planned for production |
| **SSE with polling** | DB load every 5 seconds per connection | Simple implementation; pub/sub planned |
| **No query caching** | Higher DB load | Data freshness critical for incident management |
| **Cookie sessions** | Larger request headers | No session store infrastructure needed |
| **bcrypt (not Argon2)** | Slightly less modern | Widely supported, proven security |

### Known Limitations

1. **Rate limiting resets on server restart** - Use Redis for persistence
2. **SSE scales linearly with connections** - Needs pub/sub for 100+ concurrent viewers
3. **File attachments stored as URLs** - Actual file storage not implemented (mocked)
4. **No email notifications** - Job queue enqueues but doesn't send

### Recommended Next Steps

#### Phase 1: Production Hardening

- [ ] Add Redis for rate limiting and session storage
- [ ] Implement Redis Pub/Sub for SSE
- [ ] Add structured logging (Pino/Winston)
- [ ] Set up error monitoring (Sentry)
- [ ] Add APM tracing (OpenTelemetry)

#### Phase 2: Scale

- [ ] Add read replicas for Prisma
- [ ] Implement SWR/React Query with optimistic updates
- [ ] Add CDN for static assets
- [ ] Consider edge deployment for API routes

#### Phase 3: Features

- [ ] Email notifications via SendGrid/Resend
- [ ] Slack/Teams integrations
- [ ] SSO (SAML/OIDC)
- [ ] Incident templates
- [ ] On-call schedules integration (PagerDuty, Opsgenie)

### Testing Coverage

```
✓ 55 tests passing

tests/unit/
  ├── feature-flags.test.ts    # Rule evaluation, stable hashing
  └── status-transitions.test.ts # State machine logic

tests/integration/
  ├── audit-logging.test.ts    # Mutation logging
  ├── tenant-isolation.test.ts # Cross-tenant data leakage tests
  └── tenant-switching.test.ts # Context switching
```

---

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `NEXTAUTH_SECRET` | 32+ character secret for session encryption | Yes |
| `NEXTAUTH_URL` | Application URL (e.g., `http://localhost:3000`) | Yes |
| `NODE_ENV` | `development` or `production` | No |

See `.env.example` for sample values.

---

