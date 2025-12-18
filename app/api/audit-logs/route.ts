import { prisma } from "@/lib/prisma";
import { getCurrentTenantContext } from "@/lib/tenant";
import { getSession } from "@/lib/auth";
import { getAuditLogs } from "@/lib/audit-log";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const listAuditLogsSchema = z.object({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  actorId: z.string().optional(),
  action: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.string().optional(),
  cursor: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const tenantContext = await getCurrentTenantContext();

    if (!session.user || !tenantContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only admins can view audit logs
    const membership = await prisma.membership.findFirst({
      where: {
        userId: session.user.id,
        tenantId: tenantContext.tenantId,
      },
    });

    if (membership?.role !== "ADMIN" && process.env.NODE_ENV !== "development") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const query = Object.fromEntries(searchParams.entries());
    const parsed = listAuditLogsSchema.parse(query);

    const result = await getAuditLogs(tenantContext.tenantId, {
      ...parsed,
      startDate: parsed.startDate ? new Date(parsed.startDate) : undefined,
      endDate: parsed.endDate ? new Date(parsed.endDate) : undefined,
      limit: parsed.limit ? parseInt(parsed.limit) : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    return NextResponse.json(
      { error: "Failed to fetch audit logs" },
      { status: 500 }
    );
  }
}
