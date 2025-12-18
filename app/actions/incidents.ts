"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth, requireTenantAccess, canEdit } from "@/auth";

// Validation schemas
const createIncidentSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters"),
  severity: z.enum(["SEV1", "SEV2", "SEV3", "SEV4"]),
  service: z.string().min(1, "Service is required"),
  environment: z.enum(["DEV", "STAGING", "PROD"]),
  tags: z.array(z.string()).optional(),
});

const updateIncidentSchema = z.object({
  title: z.string().min(5).optional(),
  severity: z.enum(["SEV1", "SEV2", "SEV3", "SEV4"]).optional(),
  service: z.string().min(1).optional(),
  environment: z.enum(["DEV", "STAGING", "PROD"]).optional(),
  tags: z.array(z.string()).optional(),
  assigneeId: z.string().nullable().optional(),
});

type PrismaTransaction = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

type IncidentRecord = {
  id: string;
  status: "OPEN" | "MITIGATED" | "RESOLVED";
  assigneeId: string | null;
};

export type ActionState = {
  error?: string;
  success?: boolean;
  data?: unknown;
};

// Valid status transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  OPEN: ["MITIGATED", "RESOLVED"],
  MITIGATED: ["RESOLVED"],
  RESOLVED: [], // Cannot transition from resolved
};

function isValidTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) || false;
}

// Helper to get user ID (with dev mode fallback)
async function getUserId(): Promise<string> {
  const session = await auth();
  if (session?.user?.id) {
    return session.user.id;
  }
  
  // DEV MODE: Get first user
  if (process.env.NODE_ENV === "development") {
    const user = await prisma.user.findFirst();
    if (user) return user.id;
  }
  
  throw new Error("Unauthorized");
}

// Helper to get tenant from slug
async function getTenantBySlug(slug: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
  });
  if (!tenant) {
    throw new Error("Tenant not found");
  }
  return tenant;
}

/**
 * Create a new incident
 */
export async function createIncident(
  tenantSlug: string,
  prevState: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  try {
    const role = await requireTenantAccess(tenantSlug);
    if (!canEdit(role) && process.env.NODE_ENV !== "development") {
      return { error: "You don't have permission to create incidents" };
    }

    const userId = await getUserId();
    const tenant = await getTenantBySlug(tenantSlug);

    const rawData = {
      title: formData.get("title"),
      severity: formData.get("severity"),
      service: formData.get("service"),
      environment: formData.get("environment"),
      tags: formData.getAll("tags").filter(Boolean) as string[],
    };

    const parsed = createIncidentSchema.safeParse(rawData);
    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    const incident = await prisma.$transaction(async (tx: PrismaTransaction) => {
      // Create incident
      const newIncident = await tx.incident.create({
        data: {
          tenantId: tenant.id,
          title: parsed.data.title,
          severity: parsed.data.severity,
          service: parsed.data.service,
          environment: parsed.data.environment,
          tags: parsed.data.tags || [],
          status: "OPEN",
          createdById: userId,
        },
      });

      // Create initial timeline event
      await tx.timelineEvent.create({
        data: {
          incidentId: newIncident.id,
          tenantId: tenant.id,
          type: "STATUS_CHANGE",
          data: { from: null, to: "OPEN" },
          createdById: userId,
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorId: userId,
          action: "CREATE",
          entityType: "Incident",
          entityId: newIncident.id,
          afterData: newIncident,
        },
      });

      return newIncident;
    });

    revalidatePath(`/t/${tenantSlug}/incidents`);
    redirect(`/t/${tenantSlug}/incidents/${incident.id}`);
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") {
      throw error;
    }
    console.error("Error creating incident:", error);
    return { error: "Failed to create incident" };
  }
}

/**
 * Update an existing incident
 */
export async function updateIncident(
  tenantSlug: string,
  incidentId: string,
  prevState: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  try {
    const role = await requireTenantAccess(tenantSlug);
    if (!canEdit(role) && process.env.NODE_ENV !== "development") {
      return { error: "You don't have permission to update incidents" };
    }

    const userId = await getUserId();
    const tenant = await getTenantBySlug(tenantSlug);

    // Verify incident belongs to tenant
    const existingIncident = await prisma.incident.findFirst({
      where: { id: incidentId, tenantId: tenant.id },
    });

    if (!existingIncident) {
      return { error: "Incident not found" };
    }

    const rawData = {
      title: formData.get("title") || undefined,
      severity: formData.get("severity") || undefined,
      service: formData.get("service") || undefined,
      environment: formData.get("environment") || undefined,
      assigneeId: formData.get("assigneeId") || undefined,
      tags: formData.getAll("tags").filter(Boolean) as string[],
    };

    const parsed = updateIncidentSchema.safeParse(rawData);
    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    // Filter out undefined values
    const updateData = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined)
    );

    const updated = await prisma.$transaction(async (tx: PrismaTransaction) => {
      const incident = await tx.incident.update({
        where: { id: incidentId },
        data: updateData,
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorId: userId,
          action: "UPDATE",
          entityType: "Incident",
          entityId: incidentId,
          beforeData: existingIncident,
          afterData: incident,
        },
      });

      return incident;
    });

    revalidatePath(`/t/${tenantSlug}/incidents`);
    revalidatePath(`/t/${tenantSlug}/incidents/${incidentId}`);
    return { success: true, data: updated };
  } catch (error) {
    console.error("Error updating incident:", error);
    return { error: "Failed to update incident" };
  }
}

/**
 * Change incident status with enforced transitions
 */
export async function changeIncidentStatus(
  tenantSlug: string,
  incidentId: string,
  newStatus: "OPEN" | "MITIGATED" | "RESOLVED"
): Promise<ActionState> {
  try {
    const role = await requireTenantAccess(tenantSlug);
    if (!canEdit(role) && process.env.NODE_ENV !== "development") {
      return { error: "You don't have permission to change incident status" };
    }

    const userId = await getUserId();
    const tenant = await getTenantBySlug(tenantSlug);

    // Verify incident belongs to tenant
    const existingIncident = await prisma.incident.findFirst({
      where: { id: incidentId, tenantId: tenant.id },
    });

    if (!existingIncident) {
      return { error: "Incident not found" };
    }

    // Validate status transition
    if (!isValidTransition(existingIncident.status, newStatus)) {
      return {
        error: `Invalid status transition: ${existingIncident.status} → ${newStatus}`,
      };
    }

    const updated = await prisma.$transaction(async (tx: PrismaTransaction) => {
      // Update status
      const incident = await tx.incident.update({
        where: { id: incidentId },
        data: { status: newStatus },
      });

      // Create timeline event
      await tx.timelineEvent.create({
        data: {
          incidentId,
          tenantId: tenant.id,
          type: "STATUS_CHANGE",
          data: { from: existingIncident.status, to: newStatus },
          createdById: userId,
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorId: userId,
          action: "STATUS_CHANGE",
          entityType: "Incident",
          entityId: incidentId,
          beforeData: { status: existingIncident.status },
          afterData: { status: newStatus },
        },
      });

      return incident;
    });

    revalidatePath(`/t/${tenantSlug}/incidents`);
    revalidatePath(`/t/${tenantSlug}/incidents/${incidentId}`);
    return { success: true, data: updated };
  } catch (error) {
    console.error("Error changing incident status:", error);
    return { error: "Failed to change incident status" };
  }
}

/**
 * Add a note to the incident timeline
 */
export async function addIncidentNote(
  tenantSlug: string,
  incidentId: string,
  message: string
): Promise<ActionState> {
  try {
    const role = await requireTenantAccess(tenantSlug);
    if (!canEdit(role) && process.env.NODE_ENV !== "development") {
      return { error: "You don't have permission to add notes" };
    }

    const userId = await getUserId();
    const tenant = await getTenantBySlug(tenantSlug);

    // Verify incident belongs to tenant
    const existingIncident = await prisma.incident.findFirst({
      where: { id: incidentId, tenantId: tenant.id },
    });

    if (!existingIncident) {
      return { error: "Incident not found" };
    }

    const event = await prisma.timelineEvent.create({
      data: {
        incidentId,
        tenantId: tenant.id,
        type: "NOTE",
        message,
        createdById: userId,
      },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });

    revalidatePath(`/t/${tenantSlug}/incidents/${incidentId}`);
    return { success: true, data: event };
  } catch (error) {
    console.error("Error adding note:", error);
    return { error: "Failed to add note" };
  }
}

/**
 * Add an action to the incident timeline
 */
export async function addIncidentAction(
  tenantSlug: string,
  incidentId: string,
  message: string
): Promise<ActionState> {
  try {
    const role = await requireTenantAccess(tenantSlug);
    if (!canEdit(role) && process.env.NODE_ENV !== "development") {
      return { error: "You don't have permission to add actions" };
    }

    const userId = await getUserId();
    const tenant = await getTenantBySlug(tenantSlug);

    // Verify incident belongs to tenant
    const existingIncident = await prisma.incident.findFirst({
      where: { id: incidentId, tenantId: tenant.id },
    });

    if (!existingIncident) {
      return { error: "Incident not found" };
    }

    const event = await prisma.timelineEvent.create({
      data: {
        incidentId,
        tenantId: tenant.id,
        type: "ACTION",
        message,
        createdById: userId,
      },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });

    revalidatePath(`/t/${tenantSlug}/incidents/${incidentId}`);
    return { success: true, data: event };
  } catch (error) {
    console.error("Error adding action:", error);
    return { error: "Failed to add action" };
  }
}

/**
 * Assign incident to a user
 */
export async function assignIncident(
  tenantSlug: string,
  incidentId: string,
  assigneeId: string | null
): Promise<ActionState> {
  try {
    const role = await requireTenantAccess(tenantSlug);
    if (!canEdit(role) && process.env.NODE_ENV !== "development") {
      return { error: "You don't have permission to assign incidents" };
    }

    const userId = await getUserId();
    const tenant = await getTenantBySlug(tenantSlug);

    // Verify incident belongs to tenant
    const existingIncident = await prisma.incident.findFirst({
      where: { id: incidentId, tenantId: tenant.id },
    });

    if (!existingIncident) {
      return { error: "Incident not found" };
    }

    // If assigning, verify assignee has access to tenant
    if (assigneeId) {
      const membership = await prisma.membership.findFirst({
        where: { userId: assigneeId, tenantId: tenant.id },
      });
      if (!membership) {
        return { error: "Assignee does not have access to this tenant" };
      }
    }

    const updated = await prisma.$transaction(async (tx: PrismaTransaction) => {
      const incident = await tx.incident.update({
        where: { id: incidentId },
        data: { assigneeId },
        include: {
          assignee: { select: { id: true, name: true } },
        },
      });

      // Create timeline event
      await tx.timelineEvent.create({
        data: {
          incidentId,
          tenantId: tenant.id,
          type: "ACTION",
          message: assigneeId
            ? `Assigned to ${incident.assignee?.name}`
            : "Unassigned",
          createdById: userId,
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorId: userId,
          action: "ASSIGN",
          entityType: "Incident",
          entityId: incidentId,
          beforeData: { assigneeId: existingIncident.assigneeId },
          afterData: { assigneeId },
        },
      });

      return incident;
    });

    revalidatePath(`/t/${tenantSlug}/incidents`);
    revalidatePath(`/t/${tenantSlug}/incidents/${incidentId}`);
    return { success: true, data: updated };
  } catch (error) {
    console.error("Error assigning incident:", error);
    return { error: "Failed to assign incident" };
  }
}

/**
 * Bulk update incident status
 */
export async function bulkUpdateStatus(
  tenantSlug: string,
  incidentIds: string[],
  newStatus: "OPEN" | "MITIGATED" | "RESOLVED"
): Promise<ActionState> {
  try {
    const role = await requireTenantAccess(tenantSlug);
    if (!canEdit(role) && process.env.NODE_ENV !== "development") {
      return { error: "You don't have permission to update incidents" };
    }

    const userId = await getUserId();
    const tenant = await getTenantBySlug(tenantSlug);

    // Verify all incidents belong to tenant and have valid transitions
    const incidents = await prisma.incident.findMany({
      where: { id: { in: incidentIds }, tenantId: tenant.id },
    });

    const invalidTransitions = incidents.filter(
      (i: IncidentRecord) => !isValidTransition(i.status, newStatus)
    );

    if (invalidTransitions.length > 0) {
      return {
        error: `${invalidTransitions.length} incident(s) cannot transition to ${newStatus}`,
      };
    }

    await prisma.$transaction(async (tx: PrismaTransaction) => {
      for (const incident of incidents) {
        await tx.incident.update({
          where: { id: incident.id },
          data: { status: newStatus },
        });

        await tx.timelineEvent.create({
          data: {
            incidentId: incident.id,
            tenantId: tenant.id,
            type: "STATUS_CHANGE",
            data: { from: incident.status, to: newStatus },
            createdById: userId,
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId: tenant.id,
            actorId: userId,
            action: "BULK_STATUS_CHANGE",
            entityType: "Incident",
            entityId: incident.id,
            beforeData: { status: incident.status },
            afterData: { status: newStatus },
          },
        });
      }
    });

    revalidatePath(`/t/${tenantSlug}/incidents`);
    return { success: true, data: { updated: incidents.length } };
  } catch (error) {
    console.error("Error in bulk status update:", error);
    return { error: "Failed to update incidents" };
  }
}

/**
 * Bulk assign incidents
 */
export async function bulkAssign(
  tenantSlug: string,
  incidentIds: string[],
  assigneeId: string
): Promise<ActionState> {
  try {
    const role = await requireTenantAccess(tenantSlug);
    if (!canEdit(role) && process.env.NODE_ENV !== "development") {
      return { error: "You don't have permission to assign incidents" };
    }

    const userId = await getUserId();
    const tenant = await getTenantBySlug(tenantSlug);

    // Verify assignee has access to tenant
    const membership = await prisma.membership.findFirst({
      where: { userId: assigneeId, tenantId: tenant.id },
      include: { user: { select: { name: true } } },
    });

    if (!membership) {
      return { error: "Assignee does not have access to this tenant" };
    }

    // Verify all incidents belong to tenant
    const incidents = await prisma.incident.findMany({
      where: { id: { in: incidentIds }, tenantId: tenant.id },
    });

    await prisma.$transaction(async (tx: PrismaTransaction) => {
      for (const incident of incidents) {
        await tx.incident.update({
          where: { id: incident.id },
          data: { assigneeId },
        });

        await tx.timelineEvent.create({
          data: {
            incidentId: incident.id,
            tenantId: tenant.id,
            type: "ACTION",
            message: `Assigned to ${membership.user.name}`,
            createdById: userId,
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId: tenant.id,
            actorId: userId,
            action: "BULK_ASSIGN",
            entityType: "Incident",
            entityId: incident.id,
            beforeData: { assigneeId: incident.assigneeId },
            afterData: { assigneeId },
          },
        });
      }
    });

    revalidatePath(`/t/${tenantSlug}/incidents`);
    return { success: true, data: { updated: incidents.length } };
  } catch (error) {
    console.error("Error in bulk assign:", error);
    return { error: "Failed to assign incidents" };
  }
}
