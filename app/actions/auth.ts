"use server";

import { signIn, signOut } from "@/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const signupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type AuthState = {
  error?: string;
  success?: boolean;
};

export async function login(
  prevState: AuthState | undefined,
  formData: FormData
): Promise<AuthState> {
  const rawData = {
    email: formData.get("email"),
    password: formData.get("password"),
  };

  const parsed = loginSchema.safeParse(rawData);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return { error: "Invalid email or password" };
        default:
          return { error: "Something went wrong. Please try again." };
      }
    }
    throw error;
  }

  // Get user's first tenant to redirect to
  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    include: {
      memberships: {
        include: { tenant: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });

  const tenantSlug = user?.memberships[0]?.tenant.slug || "acme-corp";
  redirect(`/t/${tenantSlug}/incidents`);
}

export async function signup(
  prevState: AuthState | undefined,
  formData: FormData
): Promise<AuthState> {
  const rawData = {
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  };

  const parsed = signupSchema.safeParse(rawData);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });

  if (existingUser) {
    return { error: "An account with this email already exists" };
  }

  // Create user
  const hashedPassword = await hashPassword(parsed.data.password);
  
  // Get the first tenant to add them to (in production, this would be different)
  const defaultTenant = await prisma.tenant.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (!defaultTenant) {
    return { error: "No tenant available. Please contact support." };
  }

  await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      password: hashedPassword,
      memberships: {
        create: {
          tenantId: defaultTenant.id,
          role: "VIEWER",
        },
      },
    },
  });

  // Sign them in
  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Account created but login failed. Please try logging in." };
    }
    throw error;
  }

  redirect(`/t/${defaultTenant.slug}/incidents`);
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}

export async function switchTenant(tenantSlug: string) {
  redirect(`/t/${tenantSlug}/incidents`);
}
