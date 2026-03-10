import pLimit from "p-limit";
import { MirrorJob, MirrorDepth, ProgressEvent, ResourceError } from "./types";
import { isSameDomain, urlToLocalPath, normalizeUrl } from "./url-utils";
import { downloadAsset } from "./asset-downloader";
import { rewriteHtml, rewriteCssContent } from "./url-rewriter";
import { writeFile } from "./file-manager";
import { jobStore } from "./job-store";

// Resource limits
const MAX_PAGES = 1000;
const MAX_ASSETS = 5000;
const CONCURRENT_DOWNLOADS = 5;

const limit = pLimit(CONCURRENT_DOWNLOADS);

interface CrawlOptions {
  jobId: string;
  startUrl: string;
  depth: MirrorDepth;
  maxDepth: number; // page recursion limit
  respectRobots: boolean;
}

// Simple robots.txt parser
async function fetchDisallowedPaths(startUrl: string, signal?: AbortSignal): Promise<Set<string>> {
  const disallowed = new Set<string>();
  try {
    const parsed = new URL(startUrl);
    const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`;
    const res = await fetch(robotsUrl, {
      signal,
      headers: { "User-Agent": "CloneWebBot/1.0" },
    });
    if (!res.ok) return disallowed;
    const text = await res.text();
    let applicable = false;
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (line.startsWith("#") || !line) continue;
      const [field, ...rest] = line.split(":");
      const value = rest.join(":").trim();
      if (field.toLowerCase() === "user-agent") {
        applicable = value === "*" || value.toLowerCase().includes("clonewebbot");
      } else if (applicable && field.toLowerCase() === "disallow" && value) {
        disallowed.add(value);
      }
    }
  } catch {
    // If we can't fetch robots.txt, allow everything
  }
  return disallowed;
}

function isDisallowed(url: string, disallowedPaths: Set<string>): boolean {
  if (disallowedPaths.size === 0) return false;
  try {
    const parsed = new URL(url);
    const pathWithQuery = parsed.pathname + parsed.search;
    for (const prefix of disallowedPaths) {
      if (pathWithQuery.startsWith(prefix)) return true;
    }
  } catch {
    // ignore
  }
  return false;
}

export async function crawl(options: CrawlOptions): Promise<void> {
  const { jobId, startUrl, depth, maxDepth, respectRobots } = options;
  const job = jobStore.get(jobId);
  if (!job) return;

  // Register AbortController for this job
  const abortCtrl = jobStore.registerAbort(jobId);
  const signal = abortCtrl.signal;

  const visitedPages = new Set<string>();
  const visitedAssets = new Set<string>();
  const pendingAssets: Array<{ url: string; localPath: string }> = [];

  function isCancelled(): boolean {
    return signal.aborted;
  }

  function emit(
    event: Partial<ProgressEvent> & { type: ProgressEvent["type"] },
    latestError?: ResourceError
  ) {
    const j = jobStore.get(jobId);
    if (!j) return;
    const full: ProgressEvent = {
      type: event.type,
      status: j.status,
      pagesFound: j.pagesFound,
      pagesDownloaded: j.pagesDownloaded,
      assetsFound: j.assetsFound,
      assetsDownloaded: j.assetsDownloaded,
      errorCount: j.errorCount,
      totalBytes: j.totalBytes,
      currentUrl: event.currentUrl,
      error: event.error,
      entryPath: event.entryPath,
      latestError,
    };
    jobStore.publish(jobId, full);
  }

  function recordError(j: MirrorJob, url: string, message: string): ResourceError {
    const entry: ResourceError = { url, message, timestamp: Date.now() };
    if (j.errors.length < 200) j.errors.push(entry);
    jobStore.incrementCounter(jobId, "errorCount");
    jobStore.set(j);
    return entry;
  }

  // Fetch robots.txt if needed
  let disallowedPaths = new Set<string>();
  if (respectRobots) {
    disallowedPaths = await fetchDisallowedPaths(startUrl, signal);
    if (isCancelled()) return;
  }

  // BFS queue entries: [url, currentDepth]
  const queue: Array<[string, number]> = [[startUrl, 0]];
  visitedPages.add(startUrl);

  // effectiveStartUrl tracks the actual domain after a potential redirect on the start page.
  // e.g. user enters http://example.com → redirects to https://www.example.com/
  // Without this, isSameDomain would compare all discovered links against the original URL
  // and fail, making every depth > 1 behave identically to depth 1 (singlepage).
  let effectiveStartUrl = startUrl;

  // Entry path (local path to the start page)
  const entryLocalPath = urlToLocalPath(startUrl);
  job.entryPath = entryLocalPath;
  job.fileMap.set(startUrl, entryLocalPath);
  jobStore.set(job);

  // Process pages BFS
  while (queue.length > 0) {
    if (isCancelled()) {
      const jc = jobStore.get(jobId);
      if (jc) {
        jc.status = "cancelled";
        jobStore.set(jc);
        emit({ type: "cancelled" });
      }
      return;
    }

    const [pageUrl, currentDepth] = queue.shift()!;

    if (visitedPages.size > MAX_PAGES) {
      emit({ type: "progress", currentUrl: pageUrl });
      break;
    }

    const j = jobStore.get(jobId);
    if (!j) break;
    j.pagesFound = visitedPages.size;
    j.status = "crawling";
    jobStore.set(j);
    emit({ type: "progress", currentUrl: pageUrl });

    // Download the page
    const localPath = j.fileMap.get(pageUrl) ?? urlToLocalPath(pageUrl);
    j.fileMap.set(pageUrl, localPath);
    jobStore.set(j);

    const result = await downloadAsset(pageUrl, localPath, jobId, signal);

    if (isCancelled()) {
      const jc = jobStore.get(jobId);
      if (jc) {
        jc.status = "cancelled";
        jobStore.set(jc);
        emit({ type: "cancelled" });
      }
      return;
    }

    if (!result.success) {
      const jj = jobStore.get(jobId);
      if (jj) {
        const e = recordError(jj, pageUrl, result.error ?? "Download failed");
        emit({ type: "progress", currentUrl: pageUrl }, e);
      }
      continue;
    }

    // Use atomic increment for thread-safe counter updates
    jobStore.incrementCounter(jobId, "pagesDownloaded");
    jobStore.incrementCounter(jobId, "totalBytes", result.size ?? 0);

    const contentType = result.contentType ?? "";
    // Use the final URL (after redirect) as base for correct relative-URL resolution
    const effectivePageUrl = result.finalUrl ?? pageUrl;

    // If the start page redirected (e.g. http→https or no-www→www), update effectiveStartUrl
    // so that same-domain checks are against the real domain, not the original input URL.
    if (pageUrl === startUrl && result.finalUrl) {
      effectiveStartUrl = result.finalUrl;
    }

    // Process HTML pages
    const jj = jobStore.get(jobId);
    if (!jj) break;

    if (isHtmlContent(contentType) || pageUrl === startUrl) {
      try {
        const fileData = await import("./file-manager").then((m) =>
          m.readFile(jobId, localPath)
        );
        const htmlStr = fileData.toString("utf-8");

        const { html: rewrittenHtml, urls: discoveredUrls } = rewriteHtml(
          htmlStr,
          effectivePageUrl,
          jj.fileMap,
          localPath,
          depth > 1  // singlepage: keep <a href> as absolute URLs (no local rewrite)
        );

        // Save rewritten HTML
        await writeFile(jobId, localPath, rewrittenHtml);

        // Process discovered URLs
        for (const discoveredUrl of discoveredUrls) {
          const normalized = normalizeUrl(discoveredUrl, pageUrl);
          if (!normalized) continue;

          // Determine if it's a page or asset link
          if (isPageLink(normalized)) {
            // Pages: add to BFS queue if depth allows and same domain
            if (
              depth >= 2 &&
              isSameDomain(normalized, effectiveStartUrl) &&
              !visitedPages.has(normalized) &&
              currentDepth < maxDepth &&
              !(respectRobots && isDisallowed(normalized, disallowedPaths))
            ) {
              visitedPages.add(normalized);
              queue.push([normalized, currentDepth + 1]);
            }
          } else {
            // Assets: add to download queue
            if (!visitedAssets.has(normalized) && visitedAssets.size < MAX_ASSETS) {
              visitedAssets.add(normalized);
              const assetLocalPath =
                jj.fileMap.get(normalized) ?? urlToLocalPath(normalized);
              jj.fileMap.set(normalized, assetLocalPath);
              pendingAssets.push({ url: normalized, localPath: assetLocalPath });
            }
          }
        }
        jobStore.set(jj);
      } catch (err) {
        const j3 = jobStore.get(jobId);
        if (j3) {
          const msg = err instanceof Error ? err.message : String(err);
          recordError(j3, pageUrl, `HTML parse error: ${msg}`);
        }
      }
    } else if (isCssContent(contentType)) {
      // Process CSS files for url() references
      try {
        const fileData = await import("./file-manager").then((m) =>
          m.readFile(jobId, localPath)
        );
        const cssStr = fileData.toString("utf-8");
        const jj2 = jobStore.get(jobId);
        if (jj2) {
          const { css: rewrittenCss, urls: cssUrls } = rewriteCssContent(
            cssStr,
            effectivePageUrl,
            jj2.fileMap,
            localPath
          );
          await writeFile(jobId, localPath, rewrittenCss);
          for (const cssUrl of cssUrls) {
            if (!visitedAssets.has(cssUrl) && visitedAssets.size < MAX_ASSETS) {
              visitedAssets.add(cssUrl);
              const assetLocalPath =
                jj2.fileMap.get(cssUrl) ?? urlToLocalPath(cssUrl);
              jj2.fileMap.set(cssUrl, assetLocalPath);
              pendingAssets.push({ url: cssUrl, localPath: assetLocalPath });
            }
          }
          jobStore.set(jj2);
        }
      } catch {
        // Ignore
      }
    }

    emit({ type: "progress", currentUrl: pageUrl });
  }

  if (isCancelled()) {
    const jc = jobStore.get(jobId);
    if (jc) {
      jc.status = "cancelled";
      jobStore.set(jc);
      emit({ type: "cancelled" });
    }
    return;
  }

  // Download all collected assets concurrently
  const j2 = jobStore.get(jobId);
  if (j2) {
    j2.assetsFound = pendingAssets.length;
    j2.status = "downloading";
    jobStore.set(j2);
    emit({ type: "progress" });
  }

  const assetTasks = pendingAssets.map((asset) =>
    limit(async () => {
      if (isCancelled()) return;

      const jCurr = jobStore.get(jobId);
      if (!jCurr) return;

      emit({ type: "progress", currentUrl: asset.url });

      const result = await downloadAsset(asset.url, asset.localPath, jobId, signal);

      if (isCancelled()) return;

      const jAfter = jobStore.get(jobId);
      if (!jAfter) return;

      if (result.success) {
        // Use atomic increments to avoid concurrent counter overwrites
        jobStore.incrementCounter(jobId, "assetsDownloaded");
        jobStore.incrementCounter(jobId, "totalBytes", result.size ?? 0);

        // Process CSS assets for nested url() references
        if (isCssContent(result.contentType ?? "")) {
          try {
            const fileData = await import("./file-manager").then((m) =>
              m.readFile(jobId, asset.localPath)
            );
            const cssStr = fileData.toString("utf-8");
            const jAfter2 = jobStore.get(jobId);
            if (jAfter2) {
              const { css: rewrittenCss } = rewriteCssContent(
                cssStr,
                asset.url,
                jAfter2.fileMap,
                asset.localPath
              );
              await writeFile(jobId, asset.localPath, rewrittenCss);
            }
          } catch {
            // Ignore
          }
        }
      } else {
        const e = recordError(jAfter, asset.url, result.error ?? "Download failed");
        emit({ type: "progress", currentUrl: asset.url }, e);
        return;
      }

      emit({ type: "progress", currentUrl: asset.url });
    })
  );

  await Promise.allSettled(assetTasks);

  if (isCancelled()) {
    const jc = jobStore.get(jobId);
    if (jc) {
      jc.status = "cancelled";
      jobStore.set(jc);
      emit({ type: "cancelled" });
    }
    return;
  }

  // Mark complete
  const jFinal = jobStore.get(jobId);
  if (jFinal) {
    jFinal.status = "complete";
    jFinal.completedAt = Date.now();
    jobStore.set(jFinal);
    emit({ type: "complete", entryPath: jFinal.entryPath });
  }
}

function isHtmlContent(contentType: string): boolean {
  return contentType.includes("text/html") || contentType.includes("application/xhtml");
}

function isCssContent(contentType: string): boolean {
  return contentType.includes("text/css");
}

function isPageLink(url: string): boolean {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    // Consider HTML pages: no extension, .html, .htm, .php, .asp, .aspx, etc.
    const pageExtensions = [".html", ".htm", ".php", ".asp", ".aspx", ".jsp", ".xhtml", ""];
    const ext = getExtension(pathname);
    return pageExtensions.includes(ext);
  } catch {
    return false;
  }
}

function getExtension(pathname: string): string {
  const parts = pathname.split("/");
  const last = parts[parts.length - 1];
  if (!last || !last.includes(".")) return "";
  const dotIdx = last.lastIndexOf(".");
  return last.slice(dotIdx).toLowerCase();
}
