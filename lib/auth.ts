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

// Cache for dev user to avoid repeated DB queries
let cachedDevUser: SessionUser | null = null;

export async function getSession(): Promise<Session> {
  const cookieStore = await cookies();
  const session = await getIronSession<Session>(cookieStore, SESSION_CONFIG);
  
  // DEV MODE: If no user, return a real user from the database for testing
  if (process.env.NODE_ENV === "development" && !session.user) {
    if (!cachedDevUser) {
      const user = await prisma.user.findFirst({
        orderBy: { createdAt: "asc" },
      });
      if (user) {
        cachedDevUser = {
          id: user.id,
          email: user.email,
          name: user.name + " (Dev)",
        };
      }
    }
    
    if (cachedDevUser) {
      return {
        user: cachedDevUser,
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
