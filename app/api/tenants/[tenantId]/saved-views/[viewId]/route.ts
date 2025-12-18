import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCurrentTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string; viewId: string }> }
) {
  try {
    const { tenantId, viewId } = await params;
    
    const session = await getSession();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantContext = await getCurrentTenantContext();
    if (!tenantContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify view belongs to user and tenant
    const savedView = await prisma.savedView.findFirst({
      where: {
        id: viewId,
        tenantId: tenantId,
        userId: session.user.id || "",
      },
    });

    if (!savedView) {
      return NextResponse.json(
        { error: "Saved view not found" },
        { status: 404 }
      );
    }

    await prisma.savedView.delete({
      where: { id: viewId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting saved view:", error);
    return NextResponse.json(
      { error: "Failed to delete saved view" },
      { status: 500 }
    );
  }
}
