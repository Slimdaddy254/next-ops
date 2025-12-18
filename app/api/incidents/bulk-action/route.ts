import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCurrentTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const bulkActionSchema = z.object({
  incidentIds: z.array(z.string()).min(1),
  action: z.enum(["assign-engineer", "change-status"]),
  assigneeId: z.string().optional(),
  status: z.enum(["OPEN", "MITIGATED", "RESOLVED"]).optional(),
  message: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantContext = await getCurrentTenantContext();
    if (!tenantContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { incidentIds, action, assigneeId, status, message } =
      bulkActionSchema.parse(body);

    // Verify incidents belong to tenant
    const incidents = await prisma.incident.findMany({
      where: {
        id: { in: incidentIds },
        tenantId: tenantContext.tenantId,
      },
    });

    if (incidents.length === 0) {
      return NextResponse.json(
        { error: "No incidents found" },
        { status: 404 }
      );
    }

    let updatedCount = 0;

    if (action === "assign-engineer") {
      if (!assigneeId) {
        return NextResponse.json(
          { error: "assigneeId required for assign action" },
          { status: 400 }
        );
      }

      // Verify assignee exists and is member of tenant
      const assignee = await prisma.user.findFirst({
        where: {
          id: assigneeId,
          memberships: {
            some: { tenantId: tenantContext.tenantId },
          },
        },
      });

      if (!assignee) {
        return NextResponse.json(
          { error: "Assignee not found or not member of tenant" },
          { status: 404 }
        );
      }

      const result = await prisma.incident.updateMany({
        where: {
          id: { in: incidentIds },
          tenantId: tenantContext.tenantId,
        },
        data: { assigneeId },
      });

      updatedCount = result.count;

      // Create audit logs for each update
      for (const incident of incidents) {
        await prisma.auditLog.create({
          data: {
            tenantId: tenantContext.tenantId,
            actorId: session.user.id || "",
            action: "UPDATE",
            entityType: "Incident",
            entityId: incident.id,
            beforeData: JSON.parse(JSON.stringify(incident)),
            afterData: JSON.parse(
              JSON.stringify({ ...incident, assigneeId })
            ),
          },
        });
      }
    } else if (action === "change-status") {
      if (!status) {
        return NextResponse.json(
          { error: "status required for change-status action" },
          { status: 400 }
        );
      }

      const result = await prisma.incident.updateMany({
        where: {
          id: { in: incidentIds },
          tenantId: tenantContext.tenantId,
        },
        data: { status },
      });

      updatedCount = result.count;

      // Create timeline events and audit logs
      for (const incident of incidents) {
        await prisma.timelineEvent.create({
          data: {
            incidentId: incident.id,
            tenantId: tenantContext.tenantId,
            type: "STATUS_CHANGE",
            data: { from: incident.status, to: status },
            message: message || undefined,
            createdById: session.user.id || "",
          },
        });

        await prisma.auditLog.create({
          data: {
            tenantId: tenantContext.tenantId,
            actorId: session.user.id || "",
            action: "UPDATE",
            entityType: "Incident",
            entityId: incident.id,
            beforeData: JSON.parse(JSON.stringify(incident)),
            afterData: JSON.parse(
              JSON.stringify({ ...incident, status })
            ),
          },
        });
      }
    }

    return NextResponse.json(
      { success: true, updatedCount },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    console.error("Error in bulk action:", error);
    return NextResponse.json(
      { error: "Failed to perform bulk action" },
      { status: 500 }
    );
  }
}
