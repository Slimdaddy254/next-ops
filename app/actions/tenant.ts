"use server";

import { setSession, getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Set the active tenant context in the session
 * This should be called when the user navigates to a different tenant
 */
export async function setTenantContext(tenantSlug: string) {
  const session = await getSession();
  
  if (!session.user) {
    return { error: "Not authenticated" };
  }

  // Verify user has access to this tenant
  const membership = await prisma.membership.findFirst({
    where: {
      userId: session.user.id,
      tenant: { slug: tenantSlug },
    },
    include: {
      tenant: true,
    },
  });

  if (!membership && process.env.NODE_ENV !== "development") {
    return { error: "No access to this tenant" };
  }

  // In dev mode, allow access to any tenant
  let tenant = membership?.tenant;
  if (!tenant && process.env.NODE_ENV === "development") {
    tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });
  }

  if (!tenant) {
    return { error: "Tenant not found" };
  }

  // Update session with new tenant context
  await setSession({
    ...session,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
  });

  return { success: true };
}
