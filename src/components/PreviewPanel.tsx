"use client";

import { useState, useEffect } from "react";

interface PreviewPanelProps {
  jobId: string | null;
  previewPath: string | null; // relative path inside job dir
}

const TEXT_EXTENSIONS = new Set([
  "html", "htm", "css", "js", "mjs", "ts", "tsx", "jsx",
  "json", "xml", "svg", "txt", "md", "yaml", "yml", "toml",
]);

function isTextFile(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_EXTENSIONS.has(ext);
}

export function PreviewPanel({ jobId, previewPath }: PreviewPanelProps) {
  const [activeTab, setActiveTab] = useState<"preview" | "source">("preview");
  const [sourceCode, setSourceCode] = useState<string | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);

  const canShowSource = previewPath ? isTextFile(previewPath) : false;

  // Reset tab when file changes
  useEffect(() => {
    setActiveTab("preview");
    setSourceCode(null);
  }, [previewPath]);

  // Fetch source when switching to source tab
  useEffect(() => {
    if (activeTab !== "source" || !jobId || !previewPath || sourceCode !== null) return;
    setSourceLoading(true);
    fetch(`/api/preview/${jobId}/${previewPath}`)
      .then((r) => r.text())
      .then((text) => {
        setSourceCode(text);
      })
      .catch(() => {
        setSourceCode("// Failed to load source code");
      })
      .finally(() => setSourceLoading(false));
  }, [activeTab, jobId, previewPath, sourceCode]);

  if (!jobId || !previewPath) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400 dark:text-gray-500 text-sm select-none">
        <div className="flex flex-col items-center gap-3">
          <span className="text-5xl">🖥️</span>
          <p>Preview will appear here after mirroring</p>
        </div>
      </div>
    );
  }

  const previewUrl = `/api/preview/${jobId}/${previewPath}`;

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2">
        <span className="text-xs text-gray-500 dark:text-gray-400 truncate flex-1">
          {previewPath}
        </span>

        {/* Preview / Source tabs */}
        {canShowSource && (
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shrink-0">
            <button
              onClick={() => setActiveTab("preview")}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                activeTab === "preview"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  : "bg-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50"
              }`}
            >
              Preview
            </button>
            <button
              onClick={() => setActiveTab("source")}
              className={`px-2.5 py-1 text-xs font-medium transition-colors border-l border-gray-200 dark:border-gray-700 ${
                activeTab === "source"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  : "bg-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50"
              }`}
            >
              Source
            </button>
          </div>
        )}

        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          Open tab ↗
        </a>
      </div>

      {/* Content area */}
      <div className="flex-1 relative overflow-hidden">
        {activeTab === "preview" || !canShowSource ? (
          <div className="absolute inset-0 bg-white">
            <iframe
              key={previewUrl}
              src={previewUrl}
              sandbox="allow-same-origin allow-scripts"
              className="w-full h-full border-0"
              title="Mirrored site preview"
            />
          </div>
        ) : (
          <div className="absolute inset-0 overflow-auto bg-gray-950 text-gray-100">
            {sourceLoading ? (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                Loading source...
              </div>
            ) : (
              <pre className="text-xs font-mono p-4 whitespace-pre-wrap break-all">
                <code>{sourceCode ?? ""}</code>
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
