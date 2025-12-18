import { prisma } from "@/lib/prisma";
import { getCurrentTenantContext } from "@/lib/tenant";
import { getSession } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

type PrismaTransaction = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

const updateFlagSchema = z.object({
  name: z.string().min(1).optional(),
  key: z.string().min(1).optional(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  rolloutPercentage: z.number().min(0).max(100).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const tenantContext = await getCurrentTenantContext();
    const { id } = await params;

    if (!session.user || !tenantContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const flag = await prisma.featureFlag.findFirst({
      where: { id, tenantId: tenantContext.tenantId },
      include: {
        rules: {
          orderBy: { order: "asc" },
        },
      },
    });

    if (!flag) {
      return NextResponse.json({ error: "Feature flag not found" }, { status: 404 });
    }

    return NextResponse.json(flag);
  } catch (error) {
    console.error("Error fetching feature flag:", error);
    return NextResponse.json(
      { error: "Failed to fetch feature flag" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const tenantContext = await getCurrentTenantContext();
    const { id } = await params;

    if (!session.user || !tenantContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existingFlag = await prisma.featureFlag.findFirst({
      where: { id, tenantId: tenantContext.tenantId },
    });

    if (!existingFlag) {
      return NextResponse.json({ error: "Feature flag not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = updateFlagSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // Verify user exists in database before creating audit log
    const userExists = await prisma.user.findUnique({
      where: { id: session.user!.id },
    });

    const flag = await prisma.$transaction(async (tx: PrismaTransaction) => {
      const updated = await tx.featureFlag.update({
        where: { id },
        data: parsed.data,
        include: {
          rules: {
            orderBy: { order: "asc" },
          },
        },
      });

      // Only create audit log if user exists in database
      if (userExists) {
        await tx.auditLog.create({
          data: {
            tenantId: tenantContext.tenantId,
            actorId: session.user!.id,
            action: "UPDATE",
            entityType: "FeatureFlag",
            entityId: id,
            beforeData: existingFlag,
            afterData: updated,
          },
        });
      }

      return updated;
    });

    return NextResponse.json(flag);
  } catch (error) {
    console.error("Error updating feature flag:", error);
    return NextResponse.json(
      { error: "Failed to update feature flag" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const tenantContext = await getCurrentTenantContext();
    const { id } = await params;

    if (!session.user || !tenantContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existingFlag = await prisma.featureFlag.findFirst({
      where: { id, tenantId: tenantContext.tenantId },
    });

    if (!existingFlag) {
      return NextResponse.json({ error: "Feature flag not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx: PrismaTransaction) => {
      await tx.featureFlag.delete({
        where: { id },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          tenantId: tenantContext.tenantId,
          actorId: session.user!.id,
          action: "DELETE",
          entityType: "FeatureFlag",
          entityId: id,
          beforeData: existingFlag,
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting feature flag:", error);
    return NextResponse.json(
      { error: "Failed to delete feature flag" },
      { status: 500 }
    );
  }
}
