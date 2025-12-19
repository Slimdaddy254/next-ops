import { PrismaClient } from "@prisma/client";
import { getCurrentTenantContext } from "./tenant";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Models that should be automatically tenant-scoped
const TENANT_SCOPED_MODELS = [
  'Incident',
  'FeatureFlag',
  'Rule',
  'TimelineEvent',
  'Attachment',
  'AuditLog',
  'Job',
  'SavedView',
];

const createPrismaClient = () => {
  const client = new PrismaClient();

  // Tenant enforcement middleware
  client.$use(async (params, next) => {
    // Skip middleware for non-tenant-scoped models
    if (!params.model || !TENANT_SCOPED_MODELS.includes(params.model)) {
      return next(params);
    }

    try {
      const context = await getCurrentTenantContext();

      // Require tenant context for tenant-scoped models
      if (!context?.tenantId) {
        throw new Error(
          `Tenant context required for ${params.model} operation. Ensure user is authenticated and tenant is set.`
        );
      }

      const { tenantId } = context;

      // READ operations: Automatically inject tenantId filter
      if (['findUnique', 'findUniqueOrThrow', 'findFirst', 'findMany', 'count', 'aggregate'].includes(params.action)) {
        params.args = params.args || {};
        params.args.where = {
          ...params.args.where,
          tenantId,
        };
      }

      // CREATE operations: Automatically inject tenantId
      if (params.action === 'create') {
        params.args = params.args || {};
        params.args.data = {
          ...params.args.data,
          tenantId,
        };
      }

      // CREATE MANY operations: Inject tenantId into each record
      if (params.action === 'createMany') {
        params.args = params.args || {};
        if (Array.isArray(params.args.data)) {
          params.args.data = params.args.data.map((record: any) => ({
            ...record,
            tenantId,
          }));
        } else {
          params.args.data = {
            ...params.args.data,
            tenantId,
          };
        }
      }

      // UPDATE/DELETE operations: Scope to current tenant only
      if (['update', 'updateMany', 'delete', 'deleteMany'].includes(params.action)) {
        params.args = params.args || {};
        params.args.where = {
          ...params.args.where,
          tenantId,
        };
      }

      // UPSERT operations: Inject tenantId in both where and create/update
      if (params.action === 'upsert') {
        params.args = params.args || {};
        params.args.where = {
          ...params.args.where,
          tenantId,
        };
        params.args.create = {
          ...params.args.create,
          tenantId,
        };
        params.args.update = params.args.update || {};
        // Don't override tenantId in update - it should remain the same
      }

      return next(params);
    } catch (error) {
      // If we can't get tenant context in a background job or system operation,
      // fail explicitly rather than allowing unscoped queries
      if (error instanceof Error && error.message.includes('Tenant context required')) {
        throw error;
      }
      // For other errors (like tenant context not available), re-throw
      throw new Error(`Tenant enforcement error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  return client;
};

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;