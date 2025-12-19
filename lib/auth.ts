import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { auth } from "@/auth";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface Session {
  user?: SessionUser;
  tenantId?: string;
  tenantSlug?: string;
}

interface TenantSession {
  tenantId?: string;
  tenantSlug?: string;
}

const SESSION_CONFIG = {
  password: process.env.NEXTAUTH_SECRET || "12345678901234567890123456789012", // Exactly 32 chars minimum
  cookieName: "ops_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60, // 7 days
    sameSite: "lax" as const,
  },
};

export async function getSession(): Promise<Session> {
  // Get user from NextAuth session
  const nextAuthSession = await auth();
  
  // Get tenant context from iron-session
  const cookieStore = await cookies();
  const tenantSession = await getIronSession<TenantSession>(cookieStore, SESSION_CONFIG);
  
  // Combine both sessions
  return {
    user: nextAuthSession?.user ? {
      id: nextAuthSession.user.id!,
      email: nextAuthSession.user.email!,
      name: nextAuthSession.user.name!,
    } : undefined,
    tenantId: tenantSession.tenantId,
    tenantSlug: tenantSession.tenantSlug,
  };
}

export async function setSession(data: Partial<Session>) {
  const cookieStore = await cookies();
  const session = await getIronSession<TenantSession>(cookieStore, SESSION_CONFIG);
  
  // Only store tenant context in iron-session (user is managed by NextAuth)
  if (data.tenantId !== undefined) session.tenantId = data.tenantId;
  if (data.tenantSlug !== undefined) session.tenantSlug = data.tenantSlug;
  
  await session.save();
}

export async function clearSession() {
  const cookieStore = await cookies();
  const session = await getIronSession<TenantSession>(cookieStore, SESSION_CONFIG);
  session.destroy();
}
