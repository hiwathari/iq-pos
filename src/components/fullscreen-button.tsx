"use client";

import { useEffect, useState } from "react";
import { Maximize, Minimize } from "lucide-react";

// Wraps the Fullscreen API so the Till/Kitchen Display can go edge-to-edge on a shared
// tablet/kiosk device — hiding the browser chrome (address bar, tabs) that eats into already
// limited screen space and serves no purpose once a device is dedicated to this one page.
export function FullscreenButton({ className }: { className?: string }) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    onChange();
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function toggle() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  return (
    <button
      onClick={toggle}
      title={isFullscreen ? "Exit full screen" : "Full screen"}
      className={
        className ??
        "flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-500 hover:bg-neutral-50"
      }
    >
      {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
    </button>
  );
}
