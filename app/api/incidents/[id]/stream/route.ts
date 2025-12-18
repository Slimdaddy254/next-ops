import { prisma } from "@/lib/prisma";
import { getCurrentTenantContext } from "@/lib/tenant";
import { getSession } from "@/lib/auth";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  const tenantContext = await getCurrentTenantContext();
  const { id: incidentId } = await params;

  if (!session.user || !tenantContext) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Verify incident belongs to tenant
  const incident = await prisma.incident.findFirst({
    where: { id: incidentId, tenantId: tenantContext.tenantId },
  });

  if (!incident) {
    return new Response("Incident not found", { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection message
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "connected", incidentId })}\n\n`)
      );

      // Keep track of last seen state
      let lastUpdated = incident.updatedAt;
      let lastTimelineCount = await prisma.timelineEvent.count({
        where: { incidentId },
      });

      // Poll for changes every 2 seconds
      const intervalId = setInterval(async () => {
        try {
          // Check for incident updates
          const currentIncident = await prisma.incident.findUnique({
            where: { id: incidentId },
            include: {
              assignee: { select: { id: true, name: true } },
            },
          });

          if (!currentIncident) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "deleted" })}\n\n`)
            );
            clearInterval(intervalId);
            controller.close();
            return;
          }

          // Check if incident was updated
          if (currentIncident.updatedAt > lastUpdated) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "incident_updated",
                  data: {
                    status: currentIncident.status,
                    severity: currentIncident.severity,
                    assignee: currentIncident.assignee,
                    updatedAt: currentIncident.updatedAt,
                  },
                })}\n\n`
              )
            );
            lastUpdated = currentIncident.updatedAt;
          }

          // Check for new timeline events
          const currentTimelineCount = await prisma.timelineEvent.count({
            where: { incidentId },
          });

          if (currentTimelineCount > lastTimelineCount) {
            // Fetch the new events
            const newEvents = await prisma.timelineEvent.findMany({
              where: { incidentId },
              include: {
                createdBy: { select: { id: true, name: true } },
              },
              orderBy: { createdAt: "desc" },
              take: currentTimelineCount - lastTimelineCount,
            });

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "timeline_updated",
                  data: { newEvents },
                })}\n\n`
              )
            );
            lastTimelineCount = currentTimelineCount;
          }

          // Send heartbeat
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch (error) {
          console.error("SSE polling error:", error);
        }
      }, 2000);

      // Clean up on close
      request.signal.addEventListener("abort", () => {
        clearInterval(intervalId);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
