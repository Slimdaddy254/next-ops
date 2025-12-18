import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email },
          include: {
            memberships: {
              include: {
                tenant: true,
              },
            },
          },
        });

        if (!user) {
          return null;
        }

        const isValid = await verifyPassword(password, user.password);
        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  trustHost: true,
});

// Helper to get current user with tenant memberships
export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      memberships: {
        include: {
          tenant: true,
        },
      },
    },
  });

  return user;
}

// Helper to check if user has access to a tenant
export async function getUserTenantRole(tenantSlug: string) {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const membership = user.memberships.find(
    (m) => m.tenant.slug === tenantSlug
  );

  return membership?.role || null;
}

// Helper to verify tenant access - throws if no access
export async function requireTenantAccess(tenantSlug: string) {
  const role = await getUserTenantRole(tenantSlug);
  if (!role) {
    throw new Error("Access denied: You don't have access to this tenant");
  }
  return role;
}

// Role-based access control helpers
export function canEdit(role: string | null): boolean {
  return role === "ADMIN" || role === "ENGINEER";
}

export function canAdmin(role: string | null): boolean {
  return role === "ADMIN";
}
