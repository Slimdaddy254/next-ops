import { prisma } from "@/lib/prisma";
import { getCurrentTenantContext } from "@/lib/tenant";
import { getSession } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

type PrismaTransaction = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ruleId: string }> }
) {
  try {
    const session = await getSession();
    const tenantContext = await getCurrentTenantContext();
    const { id: flagId, ruleId } = await params;

    if (!session.user || !tenantContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify flag exists and belongs to tenant
    const flag = await prisma.featureFlag.findFirst({
      where: { id: flagId, tenantId: tenantContext.tenantId },
    });

    if (!flag) {
      return NextResponse.json({ error: "Feature flag not found" }, { status: 404 });
    }

    // Verify rule exists and belongs to flag
    const rule = await prisma.rule.findFirst({
      where: { id: ruleId, flagId },
    });

    if (!rule) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx: PrismaTransaction) => {
      await tx.rule.delete({
        where: { id: ruleId },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          tenantId: tenantContext.tenantId,
          actorId: session.user!.id,
          action: "DELETE_RULE",
          entityType: "FeatureFlag",
          entityId: flagId,
          beforeData: rule,
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting rule:", error);
    return NextResponse.json(
      { error: "Failed to delete rule" },
      { status: 500 }
    );
  }
}
