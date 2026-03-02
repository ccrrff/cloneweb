"use client";

import { useEffect, useRef, useState } from "react";
import { ProgressEvent } from "@/lib/types";

interface UseSSEResult {
  event: ProgressEvent | null;
  connected: boolean;
  error: string | null;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000; // 1s, 2s, 4s (exponential backoff)

export function useSSE(jobId: string | null): UseSSEResult {
  const [event, setEvent] = useState<ProgressEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const retriesRef = useRef(0);
  const doneRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!jobId) {
      setEvent(null);
      setConnected(false);
      setError(null);
      return;
    }

    retriesRef.current = 0;
    doneRef.current = false;

    function connect() {
      if (doneRef.current) return;

      const es = new EventSource(`/api/progress?jobId=${encodeURIComponent(jobId!)}`);
      esRef.current = es;

      es.onopen = () => {
        setConnected(true);
        setError(null);
        retriesRef.current = 0; // Reset on successful connect
      };

      es.onmessage = (e) => {
        try {
          const parsed: ProgressEvent = JSON.parse(e.data);
          setEvent(parsed);
          if (
            parsed.type === "complete" ||
            parsed.type === "error" ||
            parsed.type === "cancelled"
          ) {
            doneRef.current = true;
            es.close();
            setConnected(false);
          }
        } catch {
          // Ignore malformed messages
        }
      };

      es.onerror = () => {
        es.close();
        setConnected(false);

        if (doneRef.current) return;

        if (retriesRef.current < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, retriesRef.current);
          retriesRef.current++;
          setError(`Reconnecting... (attempt ${retriesRef.current}/${MAX_RETRIES})`);
          retryTimerRef.current = setTimeout(connect, delay);
        } else {
          setError("Connection lost. The server may still be processing.");
        }
      };
    }

    connect();

    return () => {
      doneRef.current = true;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      esRef.current?.close();
      esRef.current = null;
    };
  }, [jobId]);

  return { event, connected, error };
}
