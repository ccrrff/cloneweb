import { promises as dns } from "dns";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

// Private/reserved IP ranges to block for SSRF defense
const PRIVATE_RANGES = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^169\.254\./, // Link-local
  /^::1$/, // IPv6 loopback
  /^fc00:/i, // IPv6 unique local
  /^fe80:/i, // IPv6 link-local
  /^0\./,
  /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./,
];

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "169.254.169.254",
  "instance-data",
]);

export function isPrivateIp(ip: string): boolean {
  return PRIVATE_RANGES.some((pattern) => pattern.test(ip));
}

export function isBlockedHostname(hostname: string): boolean {
  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) return true;
  // Block .local TLD
  if (hostname.endsWith(".local")) return true;
  return false;
}

export async function validateUrl(rawUrl: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL format");
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`Protocol "${parsed.protocol}" is not allowed. Only http and https are supported.`);
  }

  const hostname = parsed.hostname;

  if (isBlockedHostname(hostname)) {
    throw new Error(`Hostname "${hostname}" is not allowed`);
  }

  // Resolve DNS and check the IPs for SSRF
  try {
    const result = await dns.lookup(hostname, { all: true });
    for (const addr of result) {
      if (isPrivateIp(addr.address)) {
        throw new Error(`Hostname resolves to a private IP address: ${addr.address}`);
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("private IP")) {
      throw err;
    }
    // DNS resolution failure — block it
    throw new Error(`Could not resolve hostname: ${hostname}`);
  }

  return parsed.href;
}

export function normalizeUrl(rawUrl: string, base?: string): string | null {
  try {
    const url = base ? new URL(rawUrl, base) : new URL(rawUrl);
    // Strip fragment
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

export function isSameDomain(urlA: string, urlB: string): boolean {
  try {
    const a = new URL(urlA);
    const b = new URL(urlB);
    return a.hostname === b.hostname;
  } catch {
    return false;
  }
}

export function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/**
 * Converts an absolute URL to a safe local file path (no ".." traversal).
 * Example: https://example.com/path/to/page  -> example.com/path/to/page/index.html
 *          https://example.com/style.css      -> example.com/style.css
 */
export function urlToLocalPath(url: string): string {
  const parsed = new URL(url);
  let p = parsed.pathname;

  // Remove leading slash
  if (p.startsWith("/")) p = p.slice(1);

  // If path ends with / or has no extension, treat as HTML page
  if (p === "" || p.endsWith("/")) {
    p = p + "index.html";
  } else {
    const lastSegment = p.split("/").pop()!;
    if (!lastSegment.includes(".")) {
      p = p + "/index.html";
    }
  }

  // Sanitize path segments (no ".." allowed)
  const segments = p.split("/").map((seg) => sanitizePathSegment(seg));
  const safePath = segments.filter(Boolean).join("/");

  // Include query string in filename if present (hash already removed)
  const qs = parsed.search;
  if (qs && qs !== "?") {
    const parts = safePath.split(".");
    const qsHash = Buffer.from(qs).toString("base64url").slice(0, 16);
    if (parts.length > 1) {
      parts.splice(parts.length - 1, 0, qsHash);
      return parsed.hostname + "/" + parts.join(".");
    }
    return parsed.hostname + "/" + safePath + "_" + qsHash;
  }

  return parsed.hostname + "/" + safePath;
}

function sanitizePathSegment(seg: string): string {
  // Remove dangerous characters
  return seg.replace(/\.\./g, "__").replace(/[<>:"\\|?*\x00-\x1f]/g, "_");
}

/**
 * Validate redirect target (re-apply SSRF checks without DNS for sync use).
 * Full async validation should be done separately.
 */
export function isAllowedRedirect(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return false;
    if (isBlockedHostname(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}
