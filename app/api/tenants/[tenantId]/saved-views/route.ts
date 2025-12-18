import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCurrentTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSavedViewSchema = z.object({
  name: z.string().min(1, "Name required").max(100),
  filters: z.object({
    status: z.string().optional(),
    severity: z.string().optional(),
    environment: z.string().optional(),
    search: z.string().optional(),
  }),
});

export async function GET() {
  try {
    const session = await getSession();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantContext = await getCurrentTenantContext();
    if (!tenantContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const savedViews = await prisma.savedView.findMany({
      where: {
        tenantId: tenantContext.tenantId,
        userId: session.user.id || "",
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(savedViews);
  } catch (error) {
    console.error("Error fetching saved views:", error);
    return NextResponse.json(
      { error: "Failed to fetch saved views" },
      { status: 500 }
    );
  }
}

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
    const { name, filters } = createSavedViewSchema.parse(body);

    const savedView = await prisma.savedView.create({
      data: {
        tenantId: tenantContext.tenantId,
        userId: session.user.id || "",
        name,
        filters: JSON.parse(JSON.stringify(filters)),
      },
    });

    return NextResponse.json(savedView, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    console.error("Error creating saved view:", error);
    return NextResponse.json(
      { error: "Failed to create saved view" },
      { status: 500 }
    );
  }
}
