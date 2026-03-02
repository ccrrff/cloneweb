"use client";

import { useState, useEffect, useRef } from "react";

interface JobSummary {
  id: string;
  url: string;
  status: string;
  createdAt: number;
  completedAt?: number;
  pagesDownloaded: number;
  assetsDownloaded: number;
  totalBytes: number;
  errorCount: number;
  entryPath: string;
}

interface JobHistoryProps {
  onSelectJob: (jobId: string, entryPath: string) => void;
  currentJobId: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const STATUS_COLORS: Record<string, string> = {
  complete:    "text-green-600 dark:text-green-400",
  error:       "text-red-600 dark:text-red-400",
  cancelled:   "text-orange-600 dark:text-orange-400",
  crawling:    "text-blue-600 dark:text-blue-400",
  downloading: "text-blue-600 dark:text-blue-400",
  pending:     "text-gray-500 dark:text-gray-400",
};

export function JobHistory({ onSelectJob, currentJobId }: JobHistoryProps) {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/jobs")
      .then((r) => r.json())
      .then((data) => setJobs(data.jobs ?? []))
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        <span>🕓</span>
        <span className="hidden sm:inline">History</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-80 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              Job History
            </span>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs"
            >
              ✕
            </button>
          </div>

          {loading ? (
            <div className="p-4 text-center text-sm text-gray-400">Loading...</div>
          ) : jobs.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-400">No jobs yet</div>
          ) : (
            <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
              {jobs.map((job) => {
                const isCurrent = job.id === currentJobId;
                const canSelect = job.status === "complete" && job.entryPath;
                return (
                  <button
                    key={job.id}
                    disabled={!canSelect && !isCurrent}
                    onClick={() => {
                      if (canSelect) {
                        onSelectJob(job.id, job.entryPath);
                        setOpen(false);
                      }
                    }}
                    className={`w-full text-left px-3 py-2.5 transition-colors ${
                      isCurrent
                        ? "bg-blue-50 dark:bg-blue-900/20"
                        : canSelect
                        ? "hover:bg-gray-50 dark:hover:bg-gray-800"
                        : "opacity-60 cursor-default"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate flex-1">
                        {new URL(job.url).hostname}
                      </span>
                      <span className={`text-xs shrink-0 font-medium ${STATUS_COLORS[job.status] ?? "text-gray-500"}`}>
                        {job.status}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-400">
                      <span>{timeAgo(job.createdAt)}</span>
                      {job.pagesDownloaded > 0 && (
                        <span>· {job.pagesDownloaded} pages</span>
                      )}
                      {job.totalBytes > 0 && (
                        <span>· {formatBytes(job.totalBytes)}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
