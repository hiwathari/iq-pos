"use client";

import { useEffect, useRef } from "react";

// Runs `callback` on an interval, but only while the tab is actually visible — a Kitchen Display
// or Till left open in a background/minimized tab (common on a device nobody's looking at right
// now) would otherwise keep polling the server forever for no one. Fires once immediately on
// becoming visible again, rather than waiting out the rest of a stale interval, so staff coming
// back to the tab see fresh data right away.
export function useVisibleInterval(callback: () => void, ms: number) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;

    function start() {
      if (id !== null) return;
      id = setInterval(() => callbackRef.current(), ms);
    }
    function stop() {
      if (id === null) return;
      clearInterval(id);
      id = null;
    }

    function handleVisibility() {
      if (document.hidden) {
        stop();
      } else {
        callbackRef.current();
        start();
      }
    }

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [ms]);
}
