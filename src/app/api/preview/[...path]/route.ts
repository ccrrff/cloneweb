import { NextRequest, NextResponse } from "next/server";
import { readFile } from "@/lib/file-manager";
import { jobStore } from "@/lib/job-store";
import mime from "mime-types";
import * as path from "path";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;

  // First segment is jobId, rest is the file path
  const [jobId, ...fileParts] = pathSegments;

  if (!jobId) {
    return new NextResponse("Job ID required", { status: 400 });
  }

  const job = jobStore.get(jobId);
  if (!job) {
    return new NextResponse("Job not found", { status: 404 });
  }

  // Build safe relative path
  const relativePath = fileParts.join("/");

  // Validate the relative path
  if (relativePath.includes("..")) {
    return new NextResponse("Invalid path", { status: 400 });
  }

  let fileBuffer: Buffer;
  try {
    fileBuffer = await readFile(jobId, relativePath);
  } catch {
    // Try index.html for directory-like paths
    try {
      fileBuffer = await readFile(
        jobId,
        relativePath ? `${relativePath}/index.html` : "index.html"
      );
    } catch {
      return new NextResponse("File not found", { status: 404 });
    }
  }

  // Determine MIME type
  const ext = path.extname(relativePath).toLowerCase();
  const mimeType =
    mime.lookup(ext) || "application/octet-stream";

  return new NextResponse(new Uint8Array(fileBuffer), {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
