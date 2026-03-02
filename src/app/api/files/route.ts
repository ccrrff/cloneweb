import { NextRequest, NextResponse } from "next/server";
import { jobStore } from "@/lib/job-store";
import { listFiles } from "@/lib/file-manager";
import { FileTreeNode } from "@/lib/types";
import mime from "mime-types";
import * as path from "path";

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  const job = jobStore.get(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const files = await listFiles(jobId);

  // Build tree from flat file list
  const root: FileTreeNode = {
    name: "root",
    path: "",
    type: "directory",
    children: [],
  };

  for (const file of files) {
    insertIntoTree(root, file.path, file.size, jobId);
  }

  return NextResponse.json({
    tree: root.children ?? [],
    entryPath: job.entryPath,
    totalFiles: files.length,
  });
}

function insertIntoTree(
  root: FileTreeNode,
  filePath: string,
  size: number,
  jobId: string
): void {
  const parts = filePath.split("/").filter(Boolean);
  let current = root;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isLast = i === parts.length - 1;

    if (isLast) {
      // It's a file
      const ext = path.extname(part).toLowerCase();
      const mimeType = mime.lookup(ext) || "application/octet-stream";
      const node: FileTreeNode = {
        name: part,
        path: filePath,
        type: "file",
        mimeType,
        size,
      };
      if (!current.children) current.children = [];
      current.children.push(node);
    } else {
      // It's a directory segment
      if (!current.children) current.children = [];
      let dir = current.children.find(
        (c) => c.name === part && c.type === "directory"
      );
      if (!dir) {
        dir = {
          name: part,
          path: parts.slice(0, i + 1).join("/"),
          type: "directory",
          children: [],
        };
        current.children.push(dir);
      }
      current = dir;
    }
  }
}
