import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

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

// No cache in dev mode - always get fresh user from DB to avoid FK issues after reseeding

export async function getSession(): Promise<Session> {
  const cookieStore = await cookies();
  const session = await getIronSession<Session>(cookieStore, SESSION_CONFIG);
  
  // DEV MODE: If no user, return a real user from the database for testing
  if (process.env.NODE_ENV === "development" && !session.user) {
    const user = await prisma.user.findFirst({
      orderBy: { createdAt: "asc" },
    });
    if (user) {
      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name + " (Dev)",
        },
      };
    }
  }
  
  return session;
}

export async function setSession(data: Session) {
  const cookieStore = await cookies();
  const session = await getIronSession<Session>(cookieStore, SESSION_CONFIG);
  Object.assign(session, data);
  await session.save();
}

export async function clearSession() {
  const cookieStore = await cookies();
  const session = await getIronSession<Session>(cookieStore, SESSION_CONFIG);
  session.destroy();
}
