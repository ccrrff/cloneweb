"use client";

import { useState } from "react";

interface UrlInputProps {
  onSubmit: (url: string) => void;
  disabled?: boolean;
}

export function UrlInput({ onSubmit, disabled }: UrlInputProps) {
  const [value, setValue] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  function validate(url: string): string | null {
    if (!url.trim()) return "URL is required";
    try {
      const parsed = new URL(url.trim());
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return "Only http:// and https:// URLs are allowed";
      }
      return null;
    } catch {
      return "Please enter a valid URL (e.g. https://example.com)";
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate(value);
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);
    onSubmit(value.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex flex-col gap-2">
        <label
          htmlFor="url-input"
          className="text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Website URL
        </label>
        <div className="flex gap-2">
          <input
            id="url-input"
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (validationError) setValidationError(null);
            }}
            placeholder="https://example.com"
            disabled={disabled}
            className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={disabled}
            className="shrink-0 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-5 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed"
          >
            {disabled ? "Processing..." : "Clone"}
          </button>
        </div>
        {validationError && (
          <p className="text-xs text-red-500">{validationError}</p>
        )}
      </div>
    </form>
  );
}
