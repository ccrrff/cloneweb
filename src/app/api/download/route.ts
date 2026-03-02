import { NextRequest } from "next/server";
import { jobStore } from "@/lib/job-store";
import { createZip } from "@/lib/zip-builder";
import { getJobDir } from "@/lib/file-manager";
import { Writable } from "stream";
import archiver from "archiver";
import * as path from "path";

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("jobId");

  if (!jobId) {
    return new Response("jobId query parameter is required", { status: 400 });
  }

  const job = jobStore.get(jobId);
  if (!job) {
    return new Response("Job not found", { status: 404 });
  }

  if (job.status !== "complete") {
    return new Response("Job is not complete yet", { status: 409 });
  }

  // Parse optional paths parameter for selective download
  const pathsParam = request.nextUrl.searchParams.get("paths");
  const selectedPaths = pathsParam
    ? pathsParam.split(",").map((p) => p.trim()).filter(Boolean)
    : null;

  const hostname = new URL(job.url).hostname;
  const filename = `${hostname}-mirror.zip`;

  // Create a streaming response using TransformStream
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();

  // Convert Web Streams API writable to Node.js Writable
  const writer = writable.getWriter();
  const nodeWritable = new Writable({
    write(chunk, _encoding, callback) {
      const uint8 = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
      writer.write(uint8).then(() => callback()).catch((err) => callback(err));
    },
    final(callback) {
      writer.close().then(() => callback()).catch((err) => callback(err));
    },
    destroy(err, callback) {
      writer.abort(err ?? undefined).then(() => callback(null)).catch(() => callback(null));
    },
  });

  if (!selectedPaths) {
    // Full download
    createZip(jobId, nodeWritable).catch((err) => {
      console.error("ZIP creation error:", err);
      nodeWritable.destroy(err);
    });
  } else {
    // Selective download
    createSelectiveZip(jobId, selectedPaths, nodeWritable).catch((err) => {
      console.error("ZIP creation error:", err);
      nodeWritable.destroy(err);
    });
  }

  return new Response(readable, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

async function createSelectiveZip(
  jobId: string,
  selectedPaths: string[],
  output: Writable
): Promise<void> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.on("error", reject);
    archive.on("finish", resolve);
    output.on("error", reject);
    archive.pipe(output);

    const jobDir = getJobDir(jobId);

    for (const relPath of selectedPaths) {
      // Sanitize: no path traversal
      if (relPath.includes("..")) continue;
      const normalized = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
      const fullPath = path.join(jobDir, normalized);
      // Ensure within jobDir
      if (!fullPath.startsWith(path.resolve(jobDir))) continue;
      archive.file(fullPath, { name: normalized });
    }

    archive.finalize();
  });
}
