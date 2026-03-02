import { isAllowedRedirect, getHostname } from "./url-utils";
import { writeFile, getJobSize } from "./file-manager";

// Resource limits
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_JOB_SIZE = 500 * 1024 * 1024; // 500MB
const REQUEST_TIMEOUT = 30_000; // 30 seconds
const DOMAIN_DELAY = 200; // ms between requests to same domain

// Concurrency: managed by the caller (crawler.ts) via p-limit
// Domain delay tracking
const domainLastRequest: Map<string, number> = new Map();

async function waitDomainDelay(hostname: string): Promise<void> {
  const last = domainLastRequest.get(hostname) ?? 0;
  const now = Date.now();
  const wait = DOMAIN_DELAY - (now - last);
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  domainLastRequest.set(hostname, Date.now());
}

export interface DownloadResult {
  success: boolean;
  localPath?: string;
  contentType?: string;
  size?: number;
  error?: string;
  /** Final URL after following redirects (may differ from requested URL) */
  finalUrl?: string;
}

export async function downloadAsset(
  url: string,
  localPath: string,
  jobId: string,
  signal?: AbortSignal
): Promise<DownloadResult> {
  const hostname = getHostname(url);

  // Enforce domain delay
  await waitDomainDelay(hostname);

  // Check total job size before downloading
  try {
    const currentSize = await getJobSize(jobId);
    if (currentSize >= MAX_JOB_SIZE) {
      return { success: false, error: "Job size limit reached (500MB)" };
    }
  } catch {
    // Continue if size check fails
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  const combinedSignal = signal
    ? anySignal([signal, controller.signal])
    : controller.signal;

  try {
    const response = await fetch(url, {
      signal: combinedSignal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; CloneWeb/1.0; +https://github.com/cloneweb)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      redirect: "follow",
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    // SSRF: verify final URL after redirect
    const finalUrl = response.url;
    if (finalUrl !== url && !isAllowedRedirect(finalUrl)) {
      return {
        success: false,
        error: `Redirect to disallowed URL: ${finalUrl}`,
      };
    }

    const contentType = response.headers.get("content-type") ?? "";

    // Check Content-Length before downloading
    const contentLength = parseInt(
      response.headers.get("content-length") ?? "0"
    );
    if (contentLength > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `File too large: ${contentLength} bytes (max ${MAX_FILE_SIZE})`,
      };
    }

    // Stream the response body with size enforcement
    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    if (!response.body) {
      return { success: false, error: "No response body" };
    }

    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalSize += value.length;
      if (totalSize > MAX_FILE_SIZE) {
        reader.cancel();
        return {
          success: false,
          error: `File too large: exceeded ${MAX_FILE_SIZE} bytes`,
        };
      }
      chunks.push(value);
    }

    const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));

    await writeFile(jobId, localPath, buffer);

    return {
      success: true,
      localPath,
      contentType,
      size: totalSize,
      finalUrl: response.url !== url ? response.url : undefined,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Returns a signal that aborts when any of the given signals abort.
 */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), {
      once: true,
    });
  }
  return controller.signal;
}
