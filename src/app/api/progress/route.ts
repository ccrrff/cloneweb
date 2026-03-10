import { NextRequest } from "next/server";
import { jobStore } from "@/lib/job-store";
import { ProgressEvent } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // SSE connection timeout on Vercel

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("jobId");

  if (!jobId) {
    return new Response("jobId query parameter is required", { status: 400 });
  }

  const job = jobStore.get(jobId);
  if (!job) {
    return new Response("Job not found", { status: 404 });
  }

  // Create a ReadableStream for SSE
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      function send(event: ProgressEvent) {
        const data = JSON.stringify(event);
        const message = `data: ${data}\n\n`;
        try {
          controller.enqueue(encoder.encode(message));
        } catch {
          // Controller closed
        }
      }

      // Send current state immediately
      const currentJob = jobStore.get(jobId);
      if (currentJob) {
        const isDone =
          currentJob.status === "complete" ||
          currentJob.status === "error" ||
          currentJob.status === "cancelled";
        send({
          type: currentJob.status === "complete"
            ? "complete"
            : currentJob.status === "cancelled"
            ? "cancelled"
            : "progress",
          status: currentJob.status,
          pagesFound: currentJob.pagesFound,
          pagesDownloaded: currentJob.pagesDownloaded,
          assetsFound: currentJob.assetsFound,
          assetsDownloaded: currentJob.assetsDownloaded,
          errorCount: currentJob.errorCount,
          totalBytes: currentJob.totalBytes,
          entryPath: currentJob.entryPath,
        });

        // If job is already done, close immediately
        if (isDone) {
          controller.close();
          return;
        }
      }

      // Subscribe to progress events
      const unsubscribe = jobStore.subscribe(jobId, (event) => {
        send(event);

        if (event.type === "complete" || event.type === "error" || event.type === "cancelled") {
          try {
            controller.close();
          } catch {
            // Already closed
          }
          unsubscribe();
        }
      });

      // Handle client disconnect
      request.signal.addEventListener("abort", () => {
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });

      // Keepalive ping every 15 seconds
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          clearInterval(pingInterval);
        }
      }, 15_000);

      // Cleanup ping on close
      request.signal.addEventListener("abort", () => {
        clearInterval(pingInterval);
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
