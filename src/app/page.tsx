"use client";

import { useReducer, useEffect, useState, useCallback } from "react";
import { UrlInput } from "@/components/UrlInput";
import { DepthSelector } from "@/components/DepthSelector";
import { ProgressBar } from "@/components/ProgressBar";
import { PreviewPanel } from "@/components/PreviewPanel";
import { FileTree } from "@/components/FileTree";
import { DownloadButton } from "@/components/DownloadButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { JobHistory } from "@/components/JobHistory";
import { useSSE } from "@/hooks/useSSE";
import { useToast } from "@/components/Toaster";
import { MirrorDepth, FileTreeNode, JobStatus, ResourceError } from "@/lib/types";

// ─── State ────────────────────────────────────────────────────────────────────

interface AppState {
  depth: MirrorDepth;
  maxDepth: number;
  respectRobots: boolean;
  jobId: string | null;
  jobStatus: JobStatus | null;
  entryPath: string | null;
  selectedFilePath: string | null;
  fileTree: FileTreeNode[];
  resourceErrors: ResourceError[];
  isSubmitting: boolean;
  submitError: string | null;
}

type AppAction =
  | { type: "SET_DEPTH"; depth: MirrorDepth }
  | { type: "SET_MAX_DEPTH"; maxDepth: number }
  | { type: "SET_RESPECT_ROBOTS"; respect: boolean }
  | { type: "SUBMIT_START" }
  | { type: "SUBMIT_SUCCESS"; jobId: string }
  | { type: "SUBMIT_ERROR"; error: string }
  | { type: "JOB_COMPLETE"; entryPath: string }
  | { type: "JOB_ERROR" }
  | { type: "JOB_CANCELLED" }
  | { type: "ADD_ERROR"; error: ResourceError }
  | { type: "SELECT_FILE"; path: string }
  | { type: "SET_FILE_TREE"; tree: FileTreeNode[] }
  | { type: "LOAD_JOB"; jobId: string; entryPath: string }
  | { type: "RESET" };

const initialState: AppState = {
  depth: 1,
  maxDepth: 0, // depth=1 (singlepage) uses maxDepth=0; updated by SET_DEPTH for other modes
  respectRobots: false,
  jobId: null,
  jobStatus: null,
  entryPath: null,
  selectedFilePath: null,
  fileTree: [],
  resourceErrors: [],
  isSubmitting: false,
  submitError: null,
};

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_DEPTH":
      return {
        ...state,
        depth: action.depth,
        maxDepth: action.depth === 2 ? 3 : action.depth === 3 ? 5 : 0,
      };
    case "SET_MAX_DEPTH":
      return { ...state, maxDepth: action.maxDepth };
    case "SET_RESPECT_ROBOTS":
      return { ...state, respectRobots: action.respect };
    case "SUBMIT_START":
      return { ...state, isSubmitting: true, submitError: null };
    case "SUBMIT_SUCCESS":
      return {
        ...state,
        isSubmitting: false,
        jobId: action.jobId,
        jobStatus: "pending",
        entryPath: null,
        selectedFilePath: null,
        fileTree: [],
        resourceErrors: [],
        submitError: null,
      };
    case "SUBMIT_ERROR":
      return { ...state, isSubmitting: false, submitError: action.error };
    case "JOB_COMPLETE":
      return {
        ...state,
        jobStatus: "complete",
        entryPath: action.entryPath,
        selectedFilePath: action.entryPath,
      };
    case "JOB_ERROR":
      return { ...state, jobStatus: "error" };
    case "JOB_CANCELLED":
      return { ...state, jobStatus: "cancelled" };
    case "ADD_ERROR":
      return {
        ...state,
        resourceErrors: [...state.resourceErrors, action.error].slice(-200),
      };
    case "SELECT_FILE":
      return { ...state, selectedFilePath: action.path };
    case "SET_FILE_TREE":
      return { ...state, fileTree: action.tree };
    case "LOAD_JOB":
      return {
        ...state,
        jobId: action.jobId,
        jobStatus: "complete",
        entryPath: action.entryPath,
        selectedFilePath: action.entryPath,
        fileTree: [],
        resourceErrors: [],
        submitError: null,
      };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function Home() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { event, error: sseError } = useSSE(state.jobId);
  const { toast } = useToast();

  // Mobile tab state
  const [mobileTab, setMobileTab] = useState<"controls" | "preview">("controls");

  // Selected files for selective download
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  // Handle SSE events
  useEffect(() => {
    if (!event) return;

    if (event.latestError) {
      dispatch({ type: "ADD_ERROR", error: event.latestError });
    }

    if (event.type === "complete" && event.entryPath) {
      dispatch({ type: "JOB_COMPLETE", entryPath: event.entryPath });
      toast("Mirror complete! Ready to preview and download.", "success");
      setMobileTab("preview");
    } else if (event.type === "error") {
      dispatch({ type: "JOB_ERROR" });
      toast(`Job failed: ${event.error ?? "Unknown error"}`, "error");
    } else if (event.type === "cancelled") {
      dispatch({ type: "JOB_CANCELLED" });
      toast("Job cancelled.", "warning");
    }
  }, [event, toast]);

  // Fetch file tree when job completes
  useEffect(() => {
    if (state.jobStatus !== "complete" || !state.jobId) return;
    fetchFileTree(state.jobId);
    setSelectedFiles(new Set());
  }, [state.jobStatus, state.jobId]);

  async function fetchFileTree(jobId: string) {
    try {
      const res = await fetch(`/api/files?jobId=${encodeURIComponent(jobId)}`);
      if (!res.ok) return;
      const data = await res.json();
      dispatch({ type: "SET_FILE_TREE", tree: data.tree });
    } catch {
      // Ignore
    }
  }

  async function handleSubmit(url: string) {
    dispatch({ type: "SUBMIT_START" });
    try {
      const res = await fetch("/api/mirror", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          depth: state.depth,
          maxDepth: state.depth === 1 ? 0 : state.maxDepth,
          respectRobots: state.respectRobots,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        dispatch({ type: "SUBMIT_ERROR", error: data.error ?? "Unknown error" });
        return;
      }

      dispatch({ type: "SUBMIT_SUCCESS", jobId: data.jobId });
      setMobileTab("controls");
    } catch (err) {
      dispatch({
        type: "SUBMIT_ERROR",
        error: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  async function handleCancel() {
    if (!state.jobId) return;
    try {
      await fetch(`/api/cancel?jobId=${encodeURIComponent(state.jobId)}`, {
        method: "POST",
      });
    } catch {
      // State will be updated via SSE
    }
  }

  const handleFileCheck = useCallback((path: string, checked: boolean) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (checked) next.add(path);
      else next.delete(path);
      return next;
    });
  }, []);

  const handleHistorySelect = useCallback(
    async (jobId: string, entryPath: string) => {
      dispatch({ type: "LOAD_JOB", jobId, entryPath });
      await fetchFileTree(jobId);
      setSelectedFiles(new Set());
      setMobileTab("preview");
    },
    []
  );

  const isProcessing =
    state.jobId !== null &&
    state.jobStatus !== "complete" &&
    state.jobStatus !== "error" &&
    state.jobStatus !== "cancelled";

  const isComplete = state.jobStatus === "complete";
  const isError = state.jobStatus === "error";
  const isCancelled = state.jobStatus === "cancelled";
  const showStartOver = isComplete || isError || isCancelled;

  // ─── Controls Panel content (shared between desktop/mobile) ──────────────
  const controlsContent = (
    <>
      <UrlInput onSubmit={handleSubmit} disabled={isProcessing || state.isSubmitting} />

      {state.submitError && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {state.submitError}
        </div>
      )}

      <DepthSelector
        depth={state.depth}
        maxDepth={state.maxDepth}
        respectRobots={state.respectRobots}
        onDepthChange={(d) => dispatch({ type: "SET_DEPTH", depth: d })}
        onMaxDepthChange={(d) => dispatch({ type: "SET_MAX_DEPTH", maxDepth: d })}
        onRobotsChange={(r) => dispatch({ type: "SET_RESPECT_ROBOTS", respect: r })}
        disabled={isProcessing || state.isSubmitting}
      />

      {(state.jobId || isProcessing) && (
        <ProgressBar
          event={event}
          status={state.jobStatus}
          resourceErrors={state.resourceErrors}
        />
      )}

      {/* Cancel button — shown while processing */}
      {isProcessing && (
        <button
          onClick={handleCancel}
          className="flex items-center justify-center gap-2 rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 px-4 py-2 text-sm font-medium transition-colors"
        >
          ✕ Cancel Job
        </button>
      )}

      {sseError && (
        <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-400">
          {sseError}
        </div>
      )}

      {isComplete && (
        <DownloadButton
          jobId={state.jobId}
          selectedPaths={selectedFiles}
        />
      )}

      {/* File tree */}
      {state.fileTree.length > 0 && (
        <div className="flex flex-col gap-2 flex-1 min-h-0">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Files
            </h2>
            {selectedFiles.size > 0 && (
              <button
                onClick={() => setSelectedFiles(new Set())}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                Clear ({selectedFiles.size})
              </button>
            )}
          </div>
          <div className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <FileTree
              nodes={state.fileTree}
              jobId={state.jobId!}
              onFileSelect={(path) => {
                dispatch({ type: "SELECT_FILE", path });
                setMobileTab("preview");
              }}
              selectedPath={state.selectedFilePath}
              selectedFiles={selectedFiles}
              onFileCheck={handleFileCheck}
            />
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3">
        <div className="mx-auto max-w-screen-2xl flex items-center gap-3">
          <span className="text-2xl">🪞</span>
          <div>
            <h1 className="text-lg font-bold leading-tight tracking-tight">
              CloneWeb
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Mirror any website locally
            </p>
          </div>

          {/* Header actions */}
          <div className="ml-auto flex items-center gap-2">
            <JobHistory
              onSelectJob={handleHistorySelect}
              currentJobId={state.jobId}
            />
            <ThemeToggle />
            {showStartOver && (
              <button
                onClick={() => {
                  dispatch({ type: "RESET" });
                  setSelectedFiles(new Set());
                  setMobileTab("controls");
                }}
                className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 underline"
              >
                Start over
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile tab bar */}
      <div className="md:hidden shrink-0 flex border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <button
          onClick={() => setMobileTab("controls")}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            mobileTab === "controls"
              ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
              : "text-gray-500 dark:text-gray-400"
          }`}
        >
          Controls
        </button>
        <button
          onClick={() => setMobileTab("preview")}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            mobileTab === "preview"
              ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
              : "text-gray-500 dark:text-gray-400"
          }`}
        >
          Preview
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — controls (desktop: always visible, mobile: tab-controlled) */}
        <aside
          className={`w-full md:w-auto md:max-w-sm shrink-0 flex flex-col gap-4 overflow-y-auto border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 ${
            mobileTab === "controls" ? "flex" : "hidden md:flex"
          }`}
        >
          {controlsContent}
        </aside>

        {/* Right panel — preview (desktop: always visible, mobile: tab-controlled) */}
        <main
          className={`flex-1 overflow-hidden bg-gray-100 dark:bg-gray-950 ${
            mobileTab === "preview" ? "flex flex-col" : "hidden md:block"
          }`}
        >
          <PreviewPanel
            jobId={state.jobId}
            previewPath={state.selectedFilePath}
          />
        </main>
      </div>
    </div>
  );
}
