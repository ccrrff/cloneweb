import { NextResponse } from "next/server";
import { jobStore } from "@/lib/job-store";

export async function GET() {
  const jobs = jobStore.all().map((job) => ({
    id: job.id,
    url: job.url,
    status: job.status,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    pagesDownloaded: job.pagesDownloaded,
    assetsDownloaded: job.assetsDownloaded,
    totalBytes: job.totalBytes,
    errorCount: job.errorCount,
    entryPath: job.entryPath,
  }));

  // Sort newest first
  jobs.sort((a, b) => b.createdAt - a.createdAt);

  return NextResponse.json({ jobs });
}
