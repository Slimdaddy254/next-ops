import { startWorker } from "../lib/job-queue";

// Start the worker
startWorker(5000).catch(console.error);

// Keep the process alive
process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down...");
  process.exit(0);
});

console.log("Worker process started. Press Ctrl+C to stop.");
