import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCurrentTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  request: NextRequest,
  {
    params,
  }: { params: { id: string; attachmentId: string } }
) {
  try {
    const session = await getSession();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantContext = await getCurrentTenantContext();
    if (!tenantContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify incident exists and user has access
    const incident = await prisma.incident.findFirst({
      where: {
        id: params.id,
        tenantId: tenantContext.tenantId,
      },
    });

    if (!incident) {
      return NextResponse.json(
        { error: "Incident not found" },
        { status: 404 }
      );
    }

    // Verify attachment belongs to this incident and tenant
    const attachment = await prisma.attachment.findFirst({
      where: {
        id: params.attachmentId,
        incidentId: params.id,
        tenantId: tenantContext.tenantId,
      },
    });

    if (!attachment) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 }
      );
    }

    // Delete attachment record
    await prisma.attachment.delete({
      where: { id: params.attachmentId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting attachment:", error);
    return NextResponse.json(
      { error: "Failed to delete attachment" },
      { status: 500 }
    );
  }
}
