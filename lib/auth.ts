import { getIronSession } from "iron-session";
import { cookies } from "next/headers";

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
  password: process.env.NEXTAUTH_SECRET || "your-secret-key-min-32-chars!!!",
  cookieName: "ops_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60, // 7 days
    sameSite: "lax" as const,
  },
};

export async function getSession(): Promise<Session> {
  const cookieStore = await cookies();
  const session = await getIronSession<Session>(cookieStore, SESSION_CONFIG);
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
