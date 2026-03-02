"use client";

import { useState } from "react";
import { useToast } from "@/components/Toaster";

interface DownloadButtonProps {
  jobId: string | null;
  selectedPaths?: Set<string>;
  disabled?: boolean;
}

async function triggerDownload(url: string, filename: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

export function DownloadButton({ jobId, selectedPaths, disabled }: DownloadButtonProps) {
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();

  const hasSelection = selectedPaths && selectedPaths.size > 0;

  async function handleDownloadAll() {
    if (!jobId || downloading) return;
    setDownloading(true);
    try {
      const url = `/api/download?jobId=${encodeURIComponent(jobId)}`;
      await triggerDownload(url, "mirror.zip");
      toast("Download started", "success");
    } catch (err) {
      toast(`Download failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setDownloading(false);
    }
  }

  async function handleDownloadSelected() {
    if (!jobId || !hasSelection || downloading) return;
    setDownloading(true);
    try {
      const paths = Array.from(selectedPaths!).join(",");
      const url = `/api/download?jobId=${encodeURIComponent(jobId)}&paths=${encodeURIComponent(paths)}`;
      await triggerDownload(url, "mirror-selected.zip");
      toast(`Downloaded ${selectedPaths!.size} file(s)`, "success");
    } catch (err) {
      toast(`Download failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setDownloading(false);
    }
  }

  const spinnerIcon = (
    <svg className="size-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );

  const downloadIcon = (
    <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleDownloadAll}
        disabled={disabled || !jobId || downloading}
        className="flex items-center justify-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white disabled:text-gray-400 dark:disabled:text-gray-500 px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed"
      >
        {downloading ? spinnerIcon : downloadIcon}
        {downloading ? "Preparing ZIP..." : "Download All (ZIP)"}
      </button>

      {hasSelection && (
        <button
          onClick={handleDownloadSelected}
          disabled={disabled || !jobId || downloading}
          className="flex items-center justify-center gap-2 rounded-lg border border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:border-gray-300 dark:disabled:border-gray-700 disabled:text-gray-400 px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed"
        >
          {downloading ? spinnerIcon : downloadIcon}
          Download Selected ({selectedPaths!.size})
        </button>
      )}
    </div>
  );
}
