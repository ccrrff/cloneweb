import archiver from "archiver";
import * as fs from "fs";
import * as path from "path";
import { getJobDir } from "./file-manager";
import { Writable } from "stream";

/**
 * Creates a ZIP archive of the job directory and pipes it to the writable stream.
 */
export async function createZip(
  jobId: string,
  output: Writable
): Promise<void> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", {
      zlib: { level: 6 }, // Balanced compression
    });

    archive.on("error", reject);
    archive.on("finish", resolve);
    output.on("error", reject);

    archive.pipe(output);

    const jobDir = getJobDir(jobId);
    archive.directory(jobDir, false);

    archive.finalize();
  });
}

/**
 * Creates a ZIP archive and writes it to a temporary file.
 * Returns the path to the ZIP file.
 */
export async function createZipFile(jobId: string): Promise<string> {
  const zipPath = path.join(getJobDir(jobId), "..", `${jobId}.zip`);
  const output = fs.createWriteStream(zipPath);
  await createZip(jobId, output);
  return zipPath;
}
