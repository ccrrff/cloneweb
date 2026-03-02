"use client";

import { useState } from "react";
import { FileTreeNode } from "@/lib/types";

interface FileTreeProps {
  nodes: FileTreeNode[];
  jobId: string;
  onFileSelect: (path: string) => void;
  selectedPath: string | null;
  selectedFiles?: Set<string>;
  onFileCheck?: (path: string, checked: boolean) => void;
}

function getMimeIcon(mimeType?: string): string {
  if (!mimeType) return "📄";
  if (mimeType.startsWith("image/")) return "🖼️";
  if (mimeType === "text/html" || mimeType === "application/xhtml+xml") return "🌐";
  if (mimeType === "text/css") return "🎨";
  if (mimeType.includes("javascript")) return "⚡";
  if (mimeType.startsWith("font/") || mimeType.includes("font")) return "🔤";
  if (mimeType.startsWith("video/")) return "🎬";
  if (mimeType.startsWith("audio/")) return "🎵";
  if (mimeType === "application/pdf") return "📑";
  if (mimeType.includes("json") || mimeType.includes("xml")) return "📋";
  return "📄";
}

function formatSize(size?: number): string {
  if (size == null) return "";
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)}KB`;
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}

function collectFilePaths(node: FileTreeNode): string[] {
  if (node.type === "file") return [node.path];
  return (node.children ?? []).flatMap(collectFilePaths);
}

interface TreeNodeProps {
  node: FileTreeNode;
  depth: number;
  jobId: string;
  onFileSelect: (path: string) => void;
  selectedPath: string | null;
  selectedFiles?: Set<string>;
  onFileCheck?: (path: string, checked: boolean) => void;
}

function TreeNode({
  node,
  depth,
  jobId,
  onFileSelect,
  selectedPath,
  selectedFiles,
  onFileCheck,
}: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isSelected = node.type === "file" && node.path === selectedPath;

  const showCheckboxes = !!onFileCheck;

  if (node.type === "directory") {
    const allPaths = collectFilePaths(node);
    const allChecked = allPaths.length > 0 && allPaths.every((p) => selectedFiles?.has(p));
    const someChecked = allPaths.some((p) => selectedFiles?.has(p));

    return (
      <div>
        <div
          className="flex w-full items-center gap-1 rounded px-2 py-1 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
          style={{ paddingLeft: `${8 + depth * 16}px` }}
        >
          {showCheckboxes && (
            <input
              type="checkbox"
              checked={allChecked}
              ref={(el) => {
                if (el) el.indeterminate = !allChecked && someChecked;
              }}
              onChange={(e) => {
                allPaths.forEach((p) => onFileCheck?.(p, e.target.checked));
              }}
              className="size-3.5 shrink-0 accent-blue-600"
              onClick={(e) => e.stopPropagation()}
            />
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 flex-1 min-w-0"
          >
            <span className="text-gray-400 text-xs">{expanded ? "▾" : "▸"}</span>
            <span className="text-sm">📁</span>
            <span className="truncate font-medium">{node.name}</span>
          </button>
        </div>
        {expanded && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                jobId={jobId}
                onFileSelect={onFileSelect}
                selectedPath={selectedPath}
                selectedFiles={selectedFiles}
                onFileCheck={onFileCheck}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isChecked = selectedFiles?.has(node.path) ?? false;

  return (
    <div
      className={`flex w-full items-center gap-1.5 rounded px-2 py-1 transition-colors ${
        isSelected
          ? "bg-blue-100 dark:bg-blue-900/30"
          : "hover:bg-gray-100 dark:hover:bg-gray-700/50"
      }`}
      style={{ paddingLeft: `${8 + depth * 16}px` }}
    >
      {showCheckboxes && (
        <input
          type="checkbox"
          checked={isChecked}
          onChange={(e) => onFileCheck?.(node.path, e.target.checked)}
          className="size-3.5 shrink-0 accent-blue-600"
          onClick={(e) => e.stopPropagation()}
        />
      )}
      <button
        onClick={() => onFileSelect(node.path)}
        className={`flex items-center gap-1.5 flex-1 min-w-0 text-left text-sm ${
          isSelected
            ? "text-blue-700 dark:text-blue-300"
            : "text-gray-600 dark:text-gray-400"
        }`}
      >
        <span className="shrink-0">{getMimeIcon(node.mimeType)}</span>
        <span className="flex-1 truncate text-xs">{node.name}</span>
        {node.size != null && (
          <span className="shrink-0 text-xs text-gray-400">{formatSize(node.size)}</span>
        )}
      </button>
    </div>
  );
}

export function FileTree({
  nodes,
  jobId,
  onFileSelect,
  selectedPath,
  selectedFiles,
  onFileCheck,
}: FileTreeProps) {
  if (nodes.length === 0) {
    return (
      <div className="p-4 text-sm text-gray-400 dark:text-gray-500 text-center">
        No files yet
      </div>
    );
  }

  return (
    <div className="overflow-y-auto max-h-full py-1">
      {nodes.map((node) => (
        <TreeNode
          key={node.path || node.name}
          node={node}
          depth={0}
          jobId={jobId}
          onFileSelect={onFileSelect}
          selectedPath={selectedPath}
          selectedFiles={selectedFiles}
          onFileCheck={onFileCheck}
        />
      ))}
    </div>
  );
}
