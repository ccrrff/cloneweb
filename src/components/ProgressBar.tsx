"use client";

import { useState } from "react";
import { ProgressEvent, JobStatus, ResourceError } from "@/lib/types";

interface ProgressBarProps {
  event: ProgressEvent | null;
  status: JobStatus | null;
  resourceErrors: ResourceError[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function ProgressBar({ event, status, resourceErrors }: ProgressBarProps) {
  const [errorsOpen, setErrorsOpen] = useState(false);

  if (!event && !status) return null;

  const pagesTotal = Math.max(event?.pagesFound ?? 0, 1);
  const pagesProgress = event?.pagesDownloaded ?? 0;
  const assetsTotal = Math.max(event?.assetsFound ?? 0, 1);
  const assetsProgress = event?.assetsDownloaded ?? 0;

  const pagePercent =
    status === "complete" ? 100 : Math.min(100, (pagesProgress / pagesTotal) * 100);
  const assetPercent =
    status === "complete" ? 100 : Math.min(100, (assetsProgress / assetsTotal) * 100);

  const isComplete = status === "complete" || event?.type === "complete";
  const isError = status === "error" || event?.type === "error";
  const isCancelled = status === "cancelled" || event?.type === "cancelled";
  const errorCount = resourceErrors.length;
  const totalBytes = event?.totalBytes ?? 0;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4">
      {/* Status badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isComplete ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 dark:bg-green-900/30 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
              <span className="size-1.5 rounded-full bg-green-500" />
              Complete
            </span>
          ) : isCancelled ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 dark:bg-orange-900/30 px-2.5 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-400">
              <span className="size-1.5 rounded-full bg-orange-500" />
              Cancelled
            </span>
          ) : isError ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 dark:bg-red-900/30 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
              <span className="size-1.5 rounded-full bg-red-500" />
              Error
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 dark:bg-blue-900/30 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400">
              <span className="size-1.5 animate-pulse rounded-full bg-blue-500" />
              {status === "downloading" ? "Downloading assets" : "Crawling pages"}
            </span>
          )}
        </div>

        {/* Error count badge — clickable to toggle list */}
        {errorCount > 0 && (
          <button
            onClick={() => setErrorsOpen((o) => !o)}
            className="flex items-center gap-1 rounded-md bg-red-50 dark:bg-red-900/20 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
          >
            ⚠ {errorCount} error{errorCount !== 1 ? "s" : ""}
            <span className="ml-0.5 text-red-400">{errorsOpen ? "▴" : "▾"}</span>
          </button>
        )}
      </div>

      {/* Pages progress */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
          <span>Pages</span>
          <span>
            {pagesProgress} / {event?.pagesFound ?? 0}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isComplete ? "bg-green-500" : isError ? "bg-red-500" : isCancelled ? "bg-orange-500" : "bg-blue-500"
            }`}
            style={{ width: `${pagePercent}%` }}
          />
        </div>
      </div>

      {/* Assets progress */}
      {(event?.assetsFound ?? 0) > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
            <span>Assets</span>
            <span>
              {assetsProgress} / {event?.assetsFound ?? 0}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isComplete ? "bg-green-500" : isError ? "bg-red-500" : isCancelled ? "bg-orange-500" : "bg-purple-500"
              }`}
              style={{ width: `${assetPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Total bytes downloaded */}
      {totalBytes > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Downloaded: <span className="font-medium text-gray-700 dark:text-gray-300">{formatBytes(totalBytes)}</span>
        </p>
      )}

      {/* Current URL */}
      {event?.currentUrl && !isComplete && !isError && !isCancelled && (
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          <span className="font-medium">Processing:</span> {event.currentUrl}
        </p>
      )}

      {/* Fatal job error */}
      {isError && event?.error && (
        <p className="text-xs text-red-600 dark:text-red-400">{event.error}</p>
      )}

      {/* Error list (expandable) */}
      {errorsOpen && errorCount > 0 && (
        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 p-2">
          {resourceErrors.map((err, i) => (
            <div key={i} className="flex flex-col gap-0.5 border-b border-red-100 dark:border-red-800/50 pb-1 last:border-0 last:pb-0">
              <p className="text-xs font-medium text-red-700 dark:text-red-300 truncate" title={err.url}>
                {err.url}
              </p>
              <p className="text-xs text-red-500 dark:text-red-400">
                {err.message}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
