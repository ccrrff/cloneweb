import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60; // Vercel: allow background crawl up to 60s (Hobby limit)
import { v4 as uuidv4 } from "uuid";
import { validateUrl } from "@/lib/url-utils";
import { jobStore } from "@/lib/job-store";
import { initJobDir } from "@/lib/file-manager";
import { crawl } from "@/lib/crawler";
import { MirrorRequest, MirrorJob, MirrorDepth } from "@/lib/types";

export async function POST(request: NextRequest) {
  let body: MirrorRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { url, depth, maxDepth, respectRobots = false } = body;

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  if (![1, 2, 3].includes(depth)) {
    return NextResponse.json(
      { error: "depth must be 1, 2, or 3" },
      { status: 400 }
    );
  }

  const validDepth = depth as MirrorDepth;

  // Validate maxDepth: must be integer in range 0-10
  let pageDepth: number;
  if (maxDepth != null) {
    const parsed = Math.trunc(Number(maxDepth));
    if (!isFinite(parsed) || parsed < 0 || parsed > 10) {
      // Fall back to depth-based default
      pageDepth = validDepth === 1 ? 0 : validDepth === 2 ? 3 : 10;
    } else {
      pageDepth = parsed;
    }
  } else {
    pageDepth = validDepth === 1 ? 0 : validDepth === 2 ? 3 : 10;
  }

  // Validate and sanitize URL (includes SSRF check with DNS resolution)
  let sanitizedUrl: string;
  try {
    sanitizedUrl = await validateUrl(url);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid URL" },
      { status: 400 }
    );
  }

  // Check concurrent job limit
  if (!jobStore.canAcceptJob()) {
    return NextResponse.json(
      { error: "Server is busy. Maximum concurrent jobs reached. Please try again later." },
      { status: 429 }
    );
  }

  const jobId = uuidv4();

  const job: MirrorJob = {
    id: jobId,
    url: sanitizedUrl,
    depth: validDepth,
    maxDepth: pageDepth,
    status: "pending",
    createdAt: Date.now(),
    pagesFound: 0,
    pagesDownloaded: 0,
    assetsFound: 0,
    assetsDownloaded: 0,
    errorCount: 0,
    totalBytes: 0,
    errors: [],
    fileMap: new Map(),
    entryPath: "",
    respectRobots,
  };

  jobStore.set(job);
  jobStore.scheduleCleanup(jobId);

  // Initialize job directory
  await initJobDir(jobId);

  // Start crawl asynchronously (fire & forget)
  crawl({
    jobId,
    startUrl: sanitizedUrl,
    depth: validDepth,
    maxDepth: pageDepth,
    respectRobots,
  }).catch((err) => {
    const j = jobStore.get(jobId);
    if (j && j.status !== "cancelled") {
      j.status = "error";
      j.error = err instanceof Error ? err.message : String(err);
      jobStore.set(j);
      jobStore.publish(jobId, {
        type: "error",
        status: "error",
        pagesFound: j.pagesFound,
        pagesDownloaded: j.pagesDownloaded,
        assetsFound: j.assetsFound,
        assetsDownloaded: j.assetsDownloaded,
        errorCount: j.errorCount,
        totalBytes: j.totalBytes,
        error: j.error,
      });
    }
  });

  return NextResponse.json({ jobId }, { status: 202 });
}
