import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";

export type JobType = "SCAN_ATTACHMENT" | "SEND_NOTIFICATION" | "INCIDENT_SUMMARY";
export type JobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

interface JobPayload {
  SCAN_ATTACHMENT: {
    attachmentId: string;
    fileName: string;
    mimeType: string;
  };
  SEND_NOTIFICATION: {
    userId: string;
    type: "incident_assigned" | "status_change" | "mention";
    incidentId?: string;
    message: string;
  };
  INCIDENT_SUMMARY: {
    incidentId: string;
    recipientIds: string[];
  };
}

/**
 * Enqueue a new job for background processing
 */
export async function enqueueJob<T extends JobType>(
  tenantId: string,
  type: T,
  payload: JobPayload[T]
): Promise<string> {
  const job = await prisma.job.create({
    data: {
      tenantId,
      type,
      payload: payload as object,
      status: "PENDING",
    },
  });

  return job.id;
}

/**
 * Get pending jobs for processing
 */
export async function getPendingJobs(limit: number = 10) {
  return prisma.job.findMany({
    where: {
      status: "PENDING",
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

/**
 * Mark a job as processing
 */
export async function markJobProcessing(jobId: string) {
  return prisma.job.update({
    where: { id: jobId },
    data: { status: "PROCESSING" },
  });
}

/**
 * Mark a job as completed
 */
export async function markJobCompleted(jobId: string, result?: object) {
  return prisma.job.update({
    where: { id: jobId },
    data: {
      status: "COMPLETED",
      result: (result ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      processedAt: new Date(),
    },
  });
}

/**
 * Mark a job as failed
 */
export async function markJobFailed(jobId: string, error: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  
  return prisma.job.update({
    where: { id: jobId },
    data: {
      status: job && job.retries < 3 ? "PENDING" : "FAILED",
      error,
      retries: { increment: 1 },
    },
  });
}

/**
 * Process attachment scanning job
 */
async function processAttachmentScan(payload: JobPayload["SCAN_ATTACHMENT"]) {
  // Simulate antivirus scanning (2-5 seconds)
  await new Promise((resolve) => setTimeout(resolve, 2000 + Math.random() * 3000));

  // 95% chance of clean, 5% chance of infected (for demo)
  const isClean = Math.random() > 0.05;

  await prisma.attachment.update({
    where: { id: payload.attachmentId },
    data: {
      scanStatus: isClean ? "CLEAN" : "INFECTED",
    },
  });

  return {
    fileName: payload.fileName,
    scanResult: isClean ? "CLEAN" : "INFECTED",
    scannedAt: new Date().toISOString(),
  };
}

/**
 * Process notification job
 */
async function processNotification(payload: JobPayload["SEND_NOTIFICATION"]) {
  // In a real app, this would send email, push notification, etc.
  console.log(`[NOTIFICATION] Sending to user ${payload.userId}: ${payload.message}`);

  // Simulate sending (1-2 seconds)
  await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));

  return {
    sent: true,
    userId: payload.userId,
    sentAt: new Date().toISOString(),
  };
}

/**
 * Process incident summary job
 */
async function processIncidentSummary(payload: JobPayload["INCIDENT_SUMMARY"]) {
  const incident = await prisma.incident.findUnique({
    where: { id: payload.incidentId },
    include: {
      timeline: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      createdBy: { select: { name: true } },
      assignee: { select: { name: true } },
    },
  });

  if (!incident) {
    throw new Error("Incident not found");
  }

  // Generate summary (in real app, might use AI)
  const summary = {
    incidentId: incident.id,
    title: incident.title,
    status: incident.status,
    severity: incident.severity,
    timelineEventCount: incident.timeline.length,
    generatedAt: new Date().toISOString(),
  };

  // In real app, would send email to recipients
  console.log(`[SUMMARY] Generated for incident ${incident.id}, sending to ${payload.recipientIds.length} recipients`);

  return summary;
}

/**
 * Process a single job
 */
export async function processJob(job: { id: string; type: string; payload: unknown }) {
  await markJobProcessing(job.id);

  try {
    let result: object;

    switch (job.type) {
      case "SCAN_ATTACHMENT":
        result = await processAttachmentScan(job.payload as JobPayload["SCAN_ATTACHMENT"]);
        break;
      case "SEND_NOTIFICATION":
        result = await processNotification(job.payload as JobPayload["SEND_NOTIFICATION"]);
        break;
      case "INCIDENT_SUMMARY":
        result = await processIncidentSummary(job.payload as JobPayload["INCIDENT_SUMMARY"]);
        break;
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }

    await markJobCompleted(job.id, result);
    return { success: true, result };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await markJobFailed(job.id, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Worker loop - polls for jobs and processes them
 */
export async function startWorker(pollingInterval: number = 5000) {
  console.log("[WORKER] Starting job worker...");

  const processLoop = async () => {
    try {
      const jobs = await getPendingJobs(5);

      for (const job of jobs) {
        console.log(`[WORKER] Processing job ${job.id} (${job.type})`);
        const result = await processJob(job);
        console.log(`[WORKER] Job ${job.id} ${result.success ? "completed" : "failed"}`);
      }
    } catch (error) {
      console.error("[WORKER] Error in job processing loop:", error);
    }
  };

  // Initial run
  await processLoop();

  // Set up polling
  const intervalId = setInterval(processLoop, pollingInterval);

  // Return cleanup function
  return () => {
    console.log("[WORKER] Stopping job worker...");
    clearInterval(intervalId);
  };
}
