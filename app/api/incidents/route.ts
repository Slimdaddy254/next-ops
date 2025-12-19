import { prisma } from "@/lib/prisma";
import { getCurrentTenantContext } from "@/lib/tenant";
import { getSession } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const createIncidentSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters"),
  severity: z.enum(["SEV1", "SEV2", "SEV3", "SEV4"]),
  service: z.string().min(1, "Service is required"),
  environment: z.enum(["DEV", "STAGING", "PROD"]),
  tags: z.array(z.string()).optional(),
});

const listIncidentsSchema = z.object({
  status: z.enum(["OPEN", "MITIGATED", "RESOLVED"]).optional(),
  severity: z.enum(["SEV1", "SEV2", "SEV3", "SEV4"]).optional(),
  environment: z.enum(["DEV", "STAGING", "PROD"]).optional(),
  service: z.string().optional(),
  tag: z.string().optional(),
  assignee: z.string().optional(),
  search: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const tenantContext = await getCurrentTenantContext();

    console.log("DEBUG - Session:", session);
    console.log("DEBUG - Tenant Context:", tenantContext);

    if (!session.user || !tenantContext) {
      console.log("DEBUG - Auth failed:", { hasUser: !!session.user, hasTenant: !!tenantContext });
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const query = Object.fromEntries(searchParams.entries());
    const parsedQuery = listIncidentsSchema.parse(query);

    // Build filter conditions
    const where: Record<string, unknown> = {
      tenantId: tenantContext.tenantId,
    };

    if (parsedQuery.status) where.status = parsedQuery.status;
    if (parsedQuery.severity) where.severity = parsedQuery.severity;
    if (parsedQuery.environment) where.environment = parsedQuery.environment;
    if (parsedQuery.service) where.service = { contains: parsedQuery.service, mode: "insensitive" };
    if (parsedQuery.tag) where.tags = { has: parsedQuery.tag };
    if (parsedQuery.assignee) where.assigneeId = parsedQuery.assignee;

    // Full-text search on title and service
    if (parsedQuery.search) {
      where.OR = [
        { title: { contains: parsedQuery.search, mode: "insensitive" } },
        { service: { contains: parsedQuery.search, mode: "insensitive" } },
      ];
    }

    const limit = Math.min(parseInt(parsedQuery.limit || "20"), 100);
    const cursor = parsedQuery.cursor ? { id: parsedQuery.cursor } : undefined;

    // Fetch incidents with cursor-based pagination
    const incidents = await prisma.incident.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1, // fetch one extra to determine if there's a next page
      ...(cursor && { skip: 1, cursor }),
    });

    let nextCursor: string | null = null;
    if (incidents.length > limit) {
      incidents.pop();
      nextCursor = incidents[incidents.length - 1]?.id || null;
    }

    return NextResponse.json({
      incidents,
      nextCursor,
      hasMore: incidents.length === limit,
    });
  } catch (error) {
    console.error("Error fetching incidents:", error);
    return NextResponse.json(
      { error: "Failed to fetch incidents" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const tenantContext = await getCurrentTenantContext();

    if (!session.user || !tenantContext) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const data = createIncidentSchema.parse(body);

    // Verify user exists in database (catches stale session after DB reseed)
    const userExists = await prisma.user.findUnique({
      where: { id: session.user.id },
    });
    
    if (!userExists) {
      return NextResponse.json(
        { error: "User not found. Please log out and log back in." },
        { status: 401 }
      );
    }

    // Create incident
    const incident = await prisma.incident.create({
      data: {
        tenantId: tenantContext.tenantId,
        title: data.title,
        severity: data.severity,
        service: data.service,
        environment: data.environment,
        tags: data.tags || [],
        status: "OPEN",
        createdById: session.user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    // Create initial status_change timeline event
    await prisma.timelineEvent.create({
      data: {
        incidentId: incident.id,
        tenantId: tenantContext.tenantId,
        type: "STATUS_CHANGE",
        data: { from: null, to: "OPEN" },
        createdById: session.user.id,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        tenantId: tenantContext.tenantId,
        actorId: session.user.id,
        action: "CREATE",
        entityType: "Incident",
        entityId: incident.id,
        afterData: JSON.parse(JSON.stringify(incident)),
      },
    });

    return NextResponse.json(incident, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    console.error("Error creating incident:", error);
    
    // Return detailed error in development, generic in production
    const errorMessage = process.env.NODE_ENV === "development" && error instanceof Error
      ? error.message
      : "Failed to create incident";
      
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
