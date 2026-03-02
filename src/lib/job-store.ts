import { MirrorJob, ProgressEvent } from "./types";
import { deleteJobDir } from "./file-manager";
import * as path from "path";
import * as fs from "fs";

// globalThis pattern to survive Next.js HMR in development
declare global {
  // eslint-disable-next-line no-var
  var __jobStore: JobStore | undefined;
}

class JobStore {
  private jobs: Map<string, MirrorJob> = new Map();
  private subscribers: Map<string, Set<(event: ProgressEvent) => void>> =
    new Map();
  private abortControllers: Map<string, AbortController> = new Map();

  // Resource limits
  private readonly MAX_CONCURRENT_JOBS = 3;

  get(jobId: string): MirrorJob | undefined {
    return this.jobs.get(jobId);
  }

  set(job: MirrorJob): void {
    this.jobs.set(job.id, job);
  }

  delete(jobId: string): void {
    this.jobs.delete(jobId);
    this.subscribers.delete(jobId);
    this.abortControllers.delete(jobId);
  }

  getActiveJobCount(): number {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (job.status === "crawling" || job.status === "downloading" || job.status === "pending") {
        count++;
      }
    }
    return count;
  }

  canAcceptJob(): boolean {
    return this.getActiveJobCount() < this.MAX_CONCURRENT_JOBS;
  }

  // Atomic counter increment to avoid race conditions in concurrent downloads
  incrementCounter(
    jobId: string,
    field: "pagesDownloaded" | "assetsDownloaded" | "errorCount" | "totalBytes",
    amount = 1
  ): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    (job[field] as number) += amount;
    this.jobs.set(jobId, job);
  }

  // Register an AbortController for a job
  registerAbort(jobId: string): AbortController {
    const ctrl = new AbortController();
    this.abortControllers.set(jobId, ctrl);
    return ctrl;
  }

  // Abort a running job
  abort(jobId: string): boolean {
    const ctrl = this.abortControllers.get(jobId);
    if (!ctrl) return false;
    ctrl.abort();
    this.abortControllers.delete(jobId);
    return true;
  }

  getAbortSignal(jobId: string): AbortSignal | undefined {
    return this.abortControllers.get(jobId)?.signal;
  }

  subscribe(
    jobId: string,
    callback: (event: ProgressEvent) => void
  ): () => void {
    if (!this.subscribers.has(jobId)) {
      this.subscribers.set(jobId, new Set());
    }
    this.subscribers.get(jobId)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.subscribers.get(jobId)?.delete(callback);
    };
  }

  publish(jobId: string, event: ProgressEvent): void {
    const subs = this.subscribers.get(jobId);
    if (subs) {
      for (const cb of subs) {
        try {
          cb(event);
        } catch {
          // Ignore subscriber errors
        }
      }
    }
  }

  // Schedule cleanup of old jobs (deletes memory + tmp dir)
  scheduleCleanup(jobId: string, ttlMs = 60 * 60 * 1000): void {
    setTimeout(() => {
      const job = this.jobs.get(jobId);
      if (job) {
        this.jobs.delete(jobId);
        this.subscribers.delete(jobId);
        this.abortControllers.delete(jobId);
        // Clean up tmp directory
        deleteJobDir(jobId).catch(() => {
          // Ignore cleanup errors
        });
      }
    }, ttlMs);
  }

  all(): MirrorJob[] {
    return Array.from(this.jobs.values());
  }
}

function getStore(): JobStore {
  if (!globalThis.__jobStore) {
    globalThis.__jobStore = new JobStore();
    // Startup cleanup: remove stale tmp directories older than 1 hour
    startupCleanup().catch(() => {});
  }
  return globalThis.__jobStore;
}

async function startupCleanup(): Promise<void> {
  try {
    const tmpDir = path.join(process.cwd(), "tmp");
    if (!fs.existsSync(tmpDir)) return;
    const entries = await fs.promises.readdir(tmpDir, { withFileTypes: true });
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dirPath = path.join(tmpDir, entry.name);
      try {
        const stat = await fs.promises.stat(dirPath);
        if (stat.mtimeMs < oneHourAgo) {
          await fs.promises.rm(dirPath, { recursive: true, force: true });
        }
      } catch {
        // Ignore
      }
    }
  } catch {
    // Ignore
  }
}

export const jobStore = getStore();
