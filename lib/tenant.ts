import { getSession } from "./auth";

/**
 * Get the current tenant context from the session
 * This is used to enforce tenant isolation throughout the app
 */
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

/**
 * Verify that a user has access to a specific tenant
 * This should be called at the data-access layer
 */
export async function verifyTenantAccess(tenantId: string): Promise<boolean> {
  const context = await getCurrentTenantContext();
  return context?.tenantId === tenantId;
}
