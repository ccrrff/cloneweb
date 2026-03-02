import { NextRequest, NextResponse } from "next/server";
import { jobStore } from "@/lib/job-store";

export async function POST(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ error: "jobId query parameter is required" }, { status: 400 });
  }

  const job = jobStore.get(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status === "complete" || job.status === "error" || job.status === "cancelled") {
    return NextResponse.json({ error: "Job is already finished" }, { status: 409 });
  }

  // Signal the AbortController
  const aborted = jobStore.abort(jobId);

  // Immediately update job status
  job.status = "cancelled";
  jobStore.set(job);

  // Publish cancelled event to any SSE subscribers
  jobStore.publish(jobId, {
    type: "cancelled",
    status: "cancelled",
    pagesFound: job.pagesFound,
    pagesDownloaded: job.pagesDownloaded,
    assetsFound: job.assetsFound,
    assetsDownloaded: job.assetsDownloaded,
    errorCount: job.errorCount,
    totalBytes: job.totalBytes,
  });

  return NextResponse.json({ success: true, aborted });
}
