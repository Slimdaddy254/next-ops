import { prisma } from "@/lib/prisma";
import { getCurrentTenantContext } from "@/lib/tenant";
import { getSession } from "@/lib/auth";
import { evaluateFeatureFlag } from "@/lib/feature-flags";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const evaluateSchema = z.object({
  userId: z.string().min(1),
  environment: z.enum(["DEV", "STAGING", "PROD"]),
  service: z.string().optional(),
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
      include: {
        rules: {
          orderBy: { order: "asc" },
        },
      },
    });

    if (!flag) {
      return NextResponse.json({ error: "Feature flag not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = evaluateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const result = evaluateFeatureFlag(flag, parsed.data);

    return NextResponse.json({
      flagKey: flag.key,
      flagName: flag.name,
      environment: flag.environment,
      ...result,
    });
  } catch (error) {
    console.error("Error evaluating feature flag:", error);
    return NextResponse.json(
      { error: "Failed to evaluate feature flag" },
      { status: 500 }
    );
  }
}
