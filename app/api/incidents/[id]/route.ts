import { prisma } from "@/lib/prisma";
import { getCurrentTenantContext } from "@/lib/tenant";
import { getSession } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const updateStatusSchema = z.object({
  status: z.enum(["OPEN", "MITIGATED", "RESOLVED"]),
  message: z.string().optional(),
});

// Valid status transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  OPEN: ["MITIGATED", "RESOLVED"],
  MITIGATED: ["RESOLVED"],
  RESOLVED: [],
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const session = await getSession();
    const tenantContext = await getCurrentTenantContext();

    if (!session.user || !tenantContext) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const incident = await prisma.incident.findFirst({
      where: {
        id: id,
        tenantId: tenantContext.tenantId,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        assignee: { select: { id: true, name: true, email: true } },
        timeline: {
          include: { createdBy: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
        attachments: true,
      },
    });

    if (!incident) {
      return NextResponse.json(
        { error: "Incident not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(incident);
  } catch (error) {
    console.error("Error fetching incident:", error);
    return NextResponse.json(
      { error: "Failed to fetch incident" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const session = await getSession();
    const tenantContext = await getCurrentTenantContext();

    if (!session.user || !tenantContext) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { status: newStatus, message } = updateStatusSchema.parse(body);

    // Get current incident
    const incident = await prisma.incident.findFirst({
      where: {
        id: id,
        tenantId: tenantContext.tenantId,
      },
    });

    if (!incident) {
      return NextResponse.json(
        { error: "Incident not found" },
        { status: 404 }
      );
    }

    // Validate status transition
    const validTransitions = VALID_TRANSITIONS[incident.status] || [];
    if (!validTransitions.includes(newStatus)) {
      return NextResponse.json(
        {
          error: `Cannot transition from ${incident.status} to ${newStatus}. Valid transitions: ${validTransitions.join(", ") || "none"}`,
        },
        { status: 400 }
      );
    }

    // Update incident in transaction
    const updatedIncident = await prisma.$transaction(async (tx) => {
      const updated = await tx.incident.update({
        where: { id: id },
        data: { status: newStatus },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          assignee: { select: { id: true, name: true, email: true } },
        },
      });

      // Create status_change timeline event
      await tx.timelineEvent.create({
        data: {
          incidentId: id,
          tenantId: tenantContext.tenantId,
          type: "STATUS_CHANGE",
          data: { from: incident.status, to: newStatus },
          createdById: session.user.id,
        },
      });

      // If message provided, create a note event
      if (message) {
        await tx.timelineEvent.create({
          data: {
            incidentId: id,
            tenantId: tenantContext.tenantId,
            type: "NOTE",
            message,
            createdById: session.user.id,
          },
        });
      }

      // Create audit log
      await tx.auditLog.create({
        data: {
          tenantId: tenantContext.tenantId,
          actorId: session.user.id,
          action: "UPDATE",
          entityType: "Incident",
          entityId: id,
          beforeData: JSON.parse(JSON.stringify(incident)),
          afterData: JSON.parse(JSON.stringify(updated)),
        },
      });

      return updated;
    });

    return NextResponse.json(updatedIncident);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    console.error("Error updating incident:", error);
    return NextResponse.json(
      { error: "Failed to update incident" },
      { status: 500 }
    );
  }
}
