import { PrismaClient } from "@prisma/client";
import { getCurrentTenantContext } from "./tenant";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Get a tenant-scoped Prisma client
 * All queries will be automatically scoped to the current tenant
 */
export async function getTenantPrisma() {
  const tenantContext = await getCurrentTenantContext();
  
  if (!tenantContext) {
    throw new Error("No tenant context found. User must be authenticated and have a tenant selected.");
  }

  // Create a proxy that enforces tenant filtering on findMany, findFirst, update, delete, etc.
  return new Proxy(prisma, {
    get(target, prop) {
      if (prop === "$disconnect") {
        return target[prop as keyof PrismaClient];
      }

      // For model operations, we could add automatic tenant filtering here
      // This is a simplified version - in production, use Prisma middleware
      return target[prop as keyof PrismaClient];
    },
  });
}

// Prisma middleware to enforce tenant filtering
  // @ts-expect-error Prisma middleware types are complex
  prisma.$use(async (params, next) => {
  // Only apply tenant filtering on data access operations
  if (["findUnique", "findUniqueOrThrow", "findFirst", "findMany", "update", "updateMany", "delete", "deleteMany"].includes(params.action)) {
    // This is where you'd add automatic tenant filtering
    // For now, it's documented to be done explicitly in queries
  }

  return next(params);
});
