import * as cheerio from "cheerio";
import * as path from "path";
import { normalizeUrl, urlToLocalPath } from "./url-utils";

// Link rel values that are NOT actual file resources — skip rewriting
const SKIP_LINK_RELS = new Set([
  "preconnect",
  "dns-prefetch",
  "canonical",
  "alternate",
  "search",
  "author",
  "license",
]);

/**
 * Compute a relative path from one local file to another.
 * Both paths use forward slashes (e.g. "example.com/index.html").
 */
function relativePath(fromFile: string, toFile: string): string {
  // Normalize separators
  const from = fromFile.replace(/\\/g, "/");
  const to = toFile.replace(/\\/g, "/");
  const fromDir = from.split("/").slice(0, -1).join("/");

  if (!fromDir) return to;

  const rel = path.relative(fromDir, to).replace(/\\/g, "/");
  // Ensure relative path starts with ./ if it doesn't traverse up
  return rel.startsWith(".") ? rel : "./" + rel;
}

/**
 * Rewrites HTML so all resource URLs point to local relative paths.
 * Returns the modified HTML and a set of discovered URLs.
 *
 * @param html - raw HTML string
 * @param baseUrl - absolute URL of the page (for resolving relative references)
 * @param fileMap - mutable map of absolute URL → local path (updated in-place)
 * @param currentLocalPath - local path of this HTML file (e.g. "example.com/index.html")
 * @param rewritePageLinks - if false, <a href> links are kept as absolute URLs (for singlepage mode)
 */
export function rewriteHtml(
  html: string,
  baseUrl: string,
  fileMap: Map<string, string>,
  currentLocalPath: string,
  rewritePageLinks = true
): { html: string; urls: Set<string> } {
  const $ = cheerio.load(html);
  const discovered = new Set<string>();

  function resolveLocal(abs: string): string {
    const local = fileMap.get(abs) ?? urlToLocalPath(abs);
    fileMap.set(abs, local);
    return local;
  }

  function toRel(localTarget: string): string {
    return relativePath(currentLocalPath, localTarget);
  }

  // ── src attributes (img, script, video, audio, source, iframe…) ──────────
  $("[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (!src || isDataUri(src) || isAbsoluteNonHttp(src)) return;
    const abs = normalizeUrl(src, baseUrl);
    if (!abs) return;
    discovered.add(abs);
    $(el).attr("src", toRel(resolveLocal(abs)));
  });

  // ── <link href> — only resource links (stylesheet, preload, icon…) ────────
  $("link[href]").each((_, el) => {
    const rel = ($(el).attr("rel") ?? "").toLowerCase().trim();
    // Skip non-resource link rels
    if (SKIP_LINK_RELS.has(rel)) return;

    const href = $(el).attr("href");
    if (!href || isDataUri(href) || isAbsoluteNonHttp(href)) return;
    const abs = normalizeUrl(href, baseUrl);
    if (!abs) return;
    discovered.add(abs);
    $(el).attr("href", toRel(resolveLocal(abs)));
  });

  // ── <a href> — collect for crawling, rewrite to local path (or keep absolute) ─
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || isDataUri(href) || href.startsWith("#")) return;
    const abs = normalizeUrl(href, baseUrl);
    if (!abs) return;
    discovered.add(abs);
    if (rewritePageLinks) {
      if (!fileMap.has(abs)) {
        fileMap.set(abs, urlToLocalPath(abs));
      }
      $(el).attr("href", toRel(fileMap.get(abs)!));
    }
    // When rewritePageLinks=false (singlepage mode), keep original absolute URL
    // so that internal links in the preview don't become broken local paths.
  });

  // ── srcset ────────────────────────────────────────────────────────────────
  $("[srcset]").each((_, el) => {
    const srcset = $(el).attr("srcset");
    if (!srcset) return;
    $(el).attr("srcset", rewriteSrcset(srcset, baseUrl, fileMap, discovered, currentLocalPath));
  });

  // ── inline style url() ────────────────────────────────────────────────────
  $("[style]").each((_, el) => {
    const style = $(el).attr("style");
    if (!style) return;
    $(el).attr("style", rewriteCssUrls(style, baseUrl, fileMap, discovered, currentLocalPath));
  });

  // ── <style> blocks ────────────────────────────────────────────────────────
  $("style").each((_, el) => {
    const css = $(el).html() ?? "";
    $(el).html(rewriteCssUrls(css, baseUrl, fileMap, discovered, currentLocalPath));
  });

  // Remove <base href> so our relative paths aren't broken by it
  $("base").removeAttr("href");

  return { html: $.html(), urls: discovered };
}

/**
 * Rewrites CSS url() and @import references to local relative paths.
 */
export function rewriteCssContent(
  css: string,
  baseUrl: string,
  fileMap: Map<string, string>,
  currentLocalPath: string
): { css: string; urls: Set<string> } {
  const discovered = new Set<string>();
  const newCss = rewriteCssUrls(css, baseUrl, fileMap, discovered, currentLocalPath);
  return { css: newCss, urls: discovered };
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function rewriteCssUrls(
  css: string,
  baseUrl: string,
  fileMap: Map<string, string>,
  discovered: Set<string>,
  currentLocalPath: string
): string {
  function resolveLocal(abs: string): string {
    const local = fileMap.get(abs) ?? urlToLocalPath(abs);
    fileMap.set(abs, local);
    return local;
  }

  function toRel(localTarget: string): string {
    return relativePath(currentLocalPath, localTarget);
  }

  // url(...) references
  const urlPattern = /url\(\s*(['"]?)([^'")\s]+)\1\s*\)/gi;
  css = css.replace(urlPattern, (match, quote, rawUrl) => {
    if (isDataUri(rawUrl)) return match;
    const abs = normalizeUrl(rawUrl, baseUrl);
    if (!abs) return match;
    discovered.add(abs);
    return `url(${quote}${toRel(resolveLocal(abs))}${quote})`;
  });

  // @import "..." or @import url(...)
  const importPattern = /@import\s+(['"]?)([^'";\s]+)\1\s*;/gi;
  css = css.replace(importPattern, (match, quote, rawUrl) => {
    if (isDataUri(rawUrl)) return match;
    const abs = normalizeUrl(rawUrl, baseUrl);
    if (!abs) return match;
    discovered.add(abs);
    return `@import ${quote}${toRel(resolveLocal(abs))}${quote};`;
  });

  return css;
}

function rewriteSrcset(
  srcset: string,
  baseUrl: string,
  fileMap: Map<string, string>,
  discovered: Set<string>,
  currentLocalPath: string
): string {
  return srcset
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      const spaceIdx = trimmed.search(/\s/);
      const url = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
      const descriptor = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx);
      if (!url || isDataUri(url)) return part;
      const abs = normalizeUrl(url, baseUrl);
      if (!abs) return part;
      discovered.add(abs);
      const local = fileMap.get(abs) ?? urlToLocalPath(abs);
      fileMap.set(abs, local);
      return relativePath(currentLocalPath, local) + descriptor;
    })
    .join(", ");
}

function isDataUri(url: string): boolean {
  return url.trim().startsWith("data:");
}

function isAbsoluteNonHttp(url: string): boolean {
  try {
    const parsed = new URL(url);
    return !["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}
