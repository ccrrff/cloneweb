"use client";

import { MirrorDepth } from "@/lib/types";

interface DepthSelectorProps {
  depth: MirrorDepth;
  maxDepth: number;
  respectRobots: boolean;
  onDepthChange: (depth: MirrorDepth) => void;
  onMaxDepthChange: (maxDepth: number) => void;
  onRobotsChange: (respect: boolean) => void;
  disabled?: boolean;
}

const DEPTH_OPTIONS: Array<{
  value: MirrorDepth;
  label: string;
  description: string;
  icon: string;
}> = [
  {
    value: 1,
    label: "Single Page",
    description: "Download only the entered URL with all its assets (images, CSS, JS).",
    icon: "📄",
  },
  {
    value: 2,
    label: "With Internal Links",
    description: "Also crawl linked pages within the same domain recursively.",
    icon: "🔗",
  },
  {
    value: 3,
    label: "Full Site",
    description: "Clone the entire website (all pages and assets, up to limits).",
    icon: "🌐",
  },
];

export function DepthSelector({
  depth,
  maxDepth,
  respectRobots,
  onDepthChange,
  onMaxDepthChange,
  onRobotsChange,
  disabled,
}: DepthSelectorProps) {
  return (
    <div className="flex flex-col gap-3">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Mirroring Depth
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {DEPTH_OPTIONS.map((option) => {
          const isSelected = depth === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => onDepthChange(option.value)}
              className={`relative flex flex-col items-start gap-1.5 rounded-xl border-2 p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                isSelected
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                  : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              <span className="text-2xl">{option.icon}</span>
              <span
                className={`text-sm font-semibold ${
                  isSelected
                    ? "text-blue-700 dark:text-blue-300"
                    : "text-gray-900 dark:text-gray-100"
                }`}
              >
                {option.label}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                {option.description}
              </span>
              {isSelected && (
                <span className="absolute top-3 right-3 size-4 rounded-full bg-blue-500 flex items-center justify-center">
                  <svg
                    className="size-2.5 text-white"
                    fill="currentColor"
                    viewBox="0 0 16 16"
                  >
                    <path d="M13.707 4.293a1 1 0 0 1 0 1.414l-7 7a1 1 0 0 1-1.414 0l-3-3a1 1 0 1 1 1.414-1.414L6 10.586l6.293-6.293a1 1 0 0 1 1.414 0z" />
                  </svg>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {(depth === 2 || depth === 3) && (
        <div className="flex flex-col gap-2 mt-1">
          <label
            htmlFor="max-depth"
            className="text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Page Depth Limit:{" "}
            <span className="text-blue-600 dark:text-blue-400">{maxDepth}</span>{" "}
            {maxDepth === 1 ? "level" : "levels"}
          </label>
          <input
            id="max-depth"
            type="range"
            min={1}
            max={depth === 2 ? 5 : 10}
            value={maxDepth}
            onChange={(e) => onMaxDepthChange(parseInt(e.target.value))}
            disabled={disabled}
            className="w-full accent-blue-600 disabled:opacity-50"
          />
          <div className="flex justify-between text-xs text-gray-400">
            <span>1 level</span>
            <span>{depth === 2 ? "5 levels" : "10 levels"}</span>
          </div>
        </div>
      )}

      {/* Robots.txt respect toggle */}
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={respectRobots}
          onChange={(e) => onRobotsChange(e.target.checked)}
          disabled={disabled}
          className="size-4 rounded accent-blue-600 disabled:opacity-50"
        />
        <span className="text-sm text-gray-700 dark:text-gray-300">
          Respect{" "}
          <span className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
            robots.txt
          </span>
        </span>
      </label>
    </div>
  );
}
