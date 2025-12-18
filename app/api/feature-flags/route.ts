import { prisma } from "@/lib/prisma";
import { getCurrentTenantContext } from "@/lib/tenant";
import { getSession } from "@/lib/auth";
import { validateRule } from "@/lib/feature-flags";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const createFlagSchema = z.object({
  key: z.string().min(1).regex(/^[a-z0-9_-]+$/, "Key must be lowercase alphanumeric with hyphens/underscores"),
  name: z.string().min(1),
  description: z.string().optional(),
  environment: z.enum(["DEV", "STAGING", "PROD"]),
  enabled: z.boolean().default(false),
});

const listFlagsSchema = z.object({
  environment: z.enum(["DEV", "STAGING", "PROD"]).optional(),
  search: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const tenantContext = await getCurrentTenantContext();

    if (!session.user || !tenantContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const query = Object.fromEntries(searchParams.entries());
    const parsed = listFlagsSchema.parse(query);

    const where: Record<string, unknown> = {
      tenantId: tenantContext.tenantId,
    };

    if (parsed.environment) {
      where.environment = parsed.environment;
    }

    if (parsed.search) {
      where.OR = [
        { key: { contains: parsed.search, mode: "insensitive" } },
        { name: { contains: parsed.search, mode: "insensitive" } },
      ];
    }

    const flags = await prisma.featureFlag.findMany({
      where,
      include: {
        rules: {
          orderBy: { order: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ flags });
  } catch (error) {
    console.error("Error fetching feature flags:", error);
    return NextResponse.json(
      { error: "Failed to fetch feature flags" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const tenantContext = await getCurrentTenantContext();

    if (!session.user || !tenantContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createFlagSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    // Check for duplicate key in same tenant + environment
    const existing = await prisma.featureFlag.findFirst({
      where: {
        tenantId: tenantContext.tenantId,
        key: parsed.data.key,
        environment: parsed.data.environment,
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Flag "${parsed.data.key}" already exists for ${parsed.data.environment}` },
        { status: 409 }
      );
    }

    const flag = await prisma.$transaction(async (tx) => {
      const newFlag = await tx.featureFlag.create({
        data: {
          tenantId: tenantContext.tenantId,
          key: parsed.data.key,
          name: parsed.data.name,
          description: parsed.data.description,
          environment: parsed.data.environment,
          enabled: parsed.data.enabled,
        },
        include: {
          rules: true,
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          tenantId: tenantContext.tenantId,
          actorId: session.user!.id,
          action: "CREATE",
          entityType: "FeatureFlag",
          entityId: newFlag.id,
          afterData: newFlag,
        },
      });

      return newFlag;
    });

    return NextResponse.json(flag, { status: 201 });
  } catch (error) {
    console.error("Error creating feature flag:", error);
    return NextResponse.json(
      { error: "Failed to create feature flag" },
      { status: 500 }
    );
  }
}
