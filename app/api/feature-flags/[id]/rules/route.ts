import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getCurrentTenantContext } from "@/lib/tenant";
import { getSession } from "@/lib/auth";
import { validateRule } from "@/lib/feature-flags";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

type PrismaTransaction = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

const addRuleSchema = z.object({
  condition: z.record(z.string(), z.unknown()),
  order: z.number().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const tenantContext = await getCurrentTenantContext();
    const { id: flagId } = await params;

    if (!session.user || !tenantContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const flag = await prisma.featureFlag.findFirst({
      where: { id: flagId, tenantId: tenantContext.tenantId },
    });

    if (!flag) {
      return NextResponse.json({ error: "Feature flag not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = addRuleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // Validate the rule condition
    const validation = validateRule(parsed.data.condition);
    if (!validation.valid) {
      return NextResponse.json(
        { error: `Invalid rule: ${validation.error}` },
        { status: 400 }
      );
    }

    // Get the next order number if not provided
    let order = parsed.data.order;
    if (order === undefined) {
      const maxOrder = await prisma.rule.aggregate({
        where: { flagId },
        _max: { order: true },
      });
      order = (maxOrder._max.order ?? -1) + 1;
    }

    const rule = await prisma.$transaction(async (tx: PrismaTransaction) => {
      const newRule = await tx.rule.create({
        data: {
          flagId,
          type: (parsed.data.condition as { type: string }).type as "ALLOWLIST" | "PERCENT_ROLLOUT" | "AND" | "OR",
          condition: parsed.data.condition as unknown as Prisma.InputJsonValue,
          order,
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          tenantId: tenantContext.tenantId,
          actorId: session.user!.id,
          action: "ADD_RULE",
          entityType: "FeatureFlag",
          entityId: flagId,
          afterData: newRule,
        },
      });

      return newRule;
    });

    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    console.error("Error adding rule:", error);
    return NextResponse.json(
      { error: "Failed to add rule" },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const tenantContext = await getCurrentTenantContext();
    const { id: flagId } = await params;

    if (!session.user || !tenantContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const flag = await prisma.featureFlag.findFirst({
      where: { id: flagId, tenantId: tenantContext.tenantId },
    });

    if (!flag) {
      return NextResponse.json({ error: "Feature flag not found" }, { status: 404 });
    }

    const rules = await prisma.rule.findMany({
      where: { flagId },
      orderBy: { order: "asc" },
    });

    return NextResponse.json({ rules });
  } catch (error) {
    console.error("Error fetching rules:", error);
    return NextResponse.json(
      { error: "Failed to fetch rules" },
      { status: 500 }
    );
  }
}
