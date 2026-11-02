"use client";

import { useEffect, useRef } from "react";

// USB / Bluetooth barcode scanners in keyboard ("HID") mode type the code very fast and press
// Enter. This listens for exactly that on the whole page (docs/retail-plan step 3.1): characters
// arriving < 40 ms apart, 6+ of them, then Enter. Normal typing in a text field is left alone —
// except fields marked data-scan-target (the Till's search box), where a scan is a lookup too.
export function useBarcodeScanner(onScan: (code: string) => void, enabled = true) {
  const handler = useRef(onScan);
  useEffect(() => {
    handler.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return;
    let buffer = "";
    let last = 0;
    let startedIn: EventTarget | null = null;

    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const now = performance.now();
      const gap = now - last;
      last = now;
      if (gap > 100) {
        buffer = "";
        startedIn = e.target;
      }
      const target = startedIn as HTMLElement | null;
      const typingInField =
        !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) && !target.dataset?.scanTarget;
      if (e.key === "Enter") {
        if (buffer.length >= 6 && !typingInField) {
          e.preventDefault();
          const code = buffer;
          buffer = "";
          // A scan into the search box shouldn't leave the digits behind there.
          if (target?.dataset?.scanTarget && "value" in target) (target as HTMLInputElement).value = "";
          handler.current(code);
        }
        buffer = "";
        return;
      }
      if (e.key.length !== 1) return;
      if (buffer && gap > 40) buffer = "";
      buffer += e.key;
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [enabled]);
}
