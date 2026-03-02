export type MirrorDepth = 1 | 2 | 3;

export interface ResourceError {
  url: string;
  message: string;
  timestamp: number;
}

export type JobStatus =
  | "pending"
  | "crawling"
  | "downloading"
  | "complete"
  | "error"
  | "cancelled";

export interface MirrorJob {
  id: string;
  url: string;
  depth: MirrorDepth;
  maxDepth: number; // user-chosen depth limit (2 or 3 means pages; 10 means full site)
  status: JobStatus;
  error?: string;
  createdAt: number;
  completedAt?: number;
  // stats
  pagesFound: number;
  pagesDownloaded: number;
  assetsFound: number;
  assetsDownloaded: number;
  errorCount: number;
  totalBytes: number;
  // individual resource errors (capped at 200)
  errors: ResourceError[];
  // file map: absolute URL -> local relative path inside tmp/{id}/
  fileMap: Map<string, string>;
  // entry point local path
  entryPath: string;
  // robots.txt respect flag
  respectRobots: boolean;
}

export interface ProgressEvent {
  type: "progress" | "complete" | "error" | "cancelled";
  status: JobStatus;
  pagesFound: number;
  pagesDownloaded: number;
  assetsFound: number;
  assetsDownloaded: number;
  errorCount: number;
  totalBytes: number;
  currentUrl?: string;
  error?: string;
  entryPath?: string;
  // latest failed resource (sent on each error event)
  latestError?: ResourceError;
}

export interface FileTreeNode {
  name: string;
  path: string; // relative to job root, used for preview URL
  type: "file" | "directory";
  mimeType?: string;
  size?: number;
  children?: FileTreeNode[];
}

export interface MirrorRequest {
  url: string;
  depth: MirrorDepth;
  maxDepth?: number;
  respectRobots?: boolean;
}

export interface MirrorResponse {
  jobId: string;
}
