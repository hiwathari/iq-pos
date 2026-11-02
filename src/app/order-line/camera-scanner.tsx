"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

// Camera barcode scanning for tills without a scanner (docs/retail-plan step 3.9): the browser's
// own BarcodeDetector where there is one (Chrome on Android / Sunmi), otherwise ZXing (loaded
// only when this opens). Each code found goes to the same onScan as a hardware scanner; the
// same code isn't repeated within 1.5 s, so holding a product in view adds it once.

type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };

export function CameraScanner({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const handler = useRef(onScan);
  useEffect(() => {
    handler.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let zxingReset: (() => void) | null = null;
    const recent = new Map<string, number>();

    function found(code: string) {
      const now = Date.now();
      if ((recent.get(code) ?? 0) > now - 1500) return;
      recent.set(code, now);
      setLastCode(code);
      handler.current(code);
    }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      } catch {
        setError("Couldn't open the camera — allow camera access for this site, or use a scanner.");
        return;
      }
      const video = videoRef.current;
      if (!video || stopped) return;
      video.srcObject = stream;
      await video.play().catch(() => {});

      const Native = (globalThis as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      if (Native) {
        const detector = new Native({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
        const tick = async () => {
          if (stopped) return;
          try {
            const codes = await detector.detect(video);
            if (codes[0]?.rawValue) found(codes[0].rawValue);
          } catch {
            // frame not ready yet
          }
          timer = setTimeout(tick, 200);
        };
        tick();
        return;
      }

      const ZX = await import("@zxing/library");
      const hints = new Map([[ZX.DecodeHintType.POSSIBLE_FORMATS, [ZX.BarcodeFormat.EAN_13, ZX.BarcodeFormat.EAN_8, ZX.BarcodeFormat.UPC_A, ZX.BarcodeFormat.CODE_128]]]);
      const reader = new ZX.BrowserMultiFormatReader(hints);
      zxingReset = () => reader.reset();
      reader.decodeFromVideoElementContinuously(video, (result) => {
        if (result && !stopped) found(result.getText());
      });
    }

    start();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      zxingReset?.();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-black shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between bg-white px-4 py-3">
          <span className="text-sm font-semibold text-neutral-800">Point the camera at a barcode</span>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100" aria-label="Close camera">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="relative aspect-[4/3] bg-black">
          <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-x-10 top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-white/80" />
        </div>
        <div className="bg-white px-4 py-2.5 text-sm text-neutral-600">
          {error ?? (lastCode ? `Added ${lastCode} — scan the next one, or close.` : "Hold the barcode inside the box.")}
        </div>
      </div>
    </div>
  );
}
