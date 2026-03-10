import * as fs from "fs";
import * as path from "path";

// On Vercel (serverless), process.cwd() is read-only at runtime; use /tmp instead.
// CLONEWEB_TMP env var allows custom override.
const TMP_DIR =
  process.env.CLONEWEB_TMP ??
  (process.env.VERCEL ? "/tmp/cloneweb" : path.join(process.cwd(), "tmp"));

// Ensure TMP_DIR exists
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

export function getJobDir(jobId: string): string {
  return path.join(TMP_DIR, sanitizeId(jobId));
}

function sanitizeId(id: string): string {
  // Only allow alphanumeric and hyphens (UUID format)
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(id)) {
    throw new Error("Invalid job ID");
  }
  return id;
}

export async function initJobDir(jobId: string): Promise<string> {
  const dir = getJobDir(jobId);
  await fs.promises.mkdir(dir, { recursive: true });
  return dir;
}

export async function writeFile(
  jobId: string,
  relativePath: string,
  data: Buffer | string
): Promise<void> {
  const jobDir = getJobDir(jobId);
  const safePath = resolveAndValidate(jobDir, relativePath);
  await fs.promises.mkdir(path.dirname(safePath), { recursive: true });
  await fs.promises.writeFile(safePath, data);
}

export async function readFile(
  jobId: string,
  relativePath: string
): Promise<Buffer> {
  const jobDir = getJobDir(jobId);
  const safePath = resolveAndValidate(jobDir, relativePath);
  return fs.promises.readFile(safePath);
}

export function getFilePath(jobId: string, relativePath: string): string {
  const jobDir = getJobDir(jobId);
  return resolveAndValidate(jobDir, relativePath);
}

export async function fileExists(jobId: string, relativePath: string): Promise<boolean> {
  try {
    const jobDir = getJobDir(jobId);
    const safePath = resolveAndValidate(jobDir, relativePath);
    await fs.promises.access(safePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function getJobSize(jobId: string): Promise<number> {
  const jobDir = getJobDir(jobId);
  return calculateDirSize(jobDir);
}

async function calculateDirSize(dir: string): Promise<number> {
  let size = 0;
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        size += await calculateDirSize(entryPath);
      } else if (entry.isFile()) {
        const stat = await fs.promises.stat(entryPath);
        size += stat.size;
      }
    }
  } catch {
    // Ignore errors
  }
  return size;
}

export async function deleteJobDir(jobId: string): Promise<void> {
  const jobDir = getJobDir(jobId);
  await fs.promises.rm(jobDir, { recursive: true, force: true });
}

export async function listFiles(jobId: string): Promise<Array<{ path: string; size: number }>> {
  const jobDir = getJobDir(jobId);
  const results: Array<{ path: string; size: number }> = [];
  await walkDir(jobDir, jobDir, results);
  return results;
}

async function walkDir(
  baseDir: string,
  currentDir: string,
  results: Array<{ path: string; size: number }>
): Promise<void> {
  try {
    const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walkDir(baseDir, fullPath, results);
      } else if (entry.isFile()) {
        const stat = await fs.promises.stat(fullPath);
        const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, "/");
        results.push({ path: relativePath, size: stat.size });
      }
    }
  } catch {
    // Ignore
  }
}

function resolveAndValidate(baseDir: string, relativePath: string): string {
  // Normalize the relative path
  const normalized = relativePath.replace(/\\/g, "/");

  // Check for path traversal attempts
  if (normalized.includes("..")) {
    throw new Error("Path traversal detected");
  }

  const resolved = path.resolve(baseDir, normalized);

  // Ensure the resolved path is inside the base directory
  if (!resolved.startsWith(path.resolve(baseDir))) {
    throw new Error("Path traversal detected");
  }

  return resolved;
}
