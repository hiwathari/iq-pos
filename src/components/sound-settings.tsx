"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, X } from "lucide-react";
import { getSoundVolumes, PLAY_SOUND, setSoundVolume, SOUND_LABELS, unlockOrderAudio, type SoundKind } from "@/lib/order-sounds";

// Sounds button + panel for the Till and Kitchen Display: one volume slider per alert type, each
// with a Test button. Levels are saved on this device (see lib/order-sounds.ts).
export function SoundSettingsButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [volumes, setVolumes] = useState<Record<SoundKind, number> | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  const allMuted = volumes ? Object.values(volumes).every((v) => v === 0) : false;

  function update(kind: SoundKind, value: number) {
    setSoundVolume(kind, value);
    setVolumes(getSoundVolumes());
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          unlockOrderAudio();
          setVolumes(getSoundVolumes());
          setOpen((o) => !o);
        }}
        title="Sound volume"
        aria-label="Sound volume"
        className={className}
      >
        {allMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        <span className="hidden 2xl:inline">Sounds</span>
      </button>
      {open && volumes && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-neutral-900">Sound volume</h3>
            <button onClick={() => setOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-4">
            {(Object.keys(SOUND_LABELS) as SoundKind[]).map((kind) => (
              <div key={kind}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-neutral-800">{SOUND_LABELS[kind].label}</span>
                  <span className="text-sm tabular-nums text-neutral-500">{Math.round(volumes[kind] * 100)}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round(volumes[kind] * 100)}
                    onChange={(e) => update(kind, Number(e.target.value) / 100)}
                    className="h-8 flex-1 accent-[var(--brand)]"
                    aria-label={`${SOUND_LABELS[kind].label} volume`}
                  />
                  <button
                    onClick={() => PLAY_SOUND[kind](volumes[kind])}
                    className="min-h-10 rounded-lg border border-neutral-200 px-3 text-sm font-semibold text-neutral-600 hover:bg-neutral-50"
                  >
                    Test
                  </button>
                </div>
                <div className="text-xs text-neutral-400">{SOUND_LABELS[kind].hint}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3">
            <span className="text-xs text-neutral-400">Saved on this device</span>
            <button
              onClick={() => (Object.keys(SOUND_LABELS) as SoundKind[]).forEach((k) => update(k, allMuted ? 1 : 0))}
              className="min-h-10 rounded-lg px-3 text-sm font-semibold text-[var(--brand-dark)] hover:bg-neutral-50"
            >
              {allMuted ? "Unmute all" : "Mute all"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
