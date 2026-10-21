"use client";

// Short, synthesized alert tones shared by the Kitchen Display and the Till — generated with the
// Web Audio API rather than shipped as audio files, so there's nothing to host or license.
// Browsers block audio before any user gesture on the page, so `unlockOrderAudio` is wired to the
// first tap on whichever screen is using it; each page gets its own AudioContext since nothing is
// shared across tabs/devices.

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

// Each kind of alert has its own volume (0–1), adjustable from the Sounds button on the Till and
// Kitchen Display. Saved per device in localStorage — a Till and a Kitchen Display on separate
// tablets each keep their own levels; on the same device they share them.
export type SoundKind = "incoming" | "kitchenNew" | "ready";

export const SOUND_LABELS: Record<SoundKind, { label: string; hint: string }> = {
  incoming: { label: "Online / QR / kiosk orders", hint: "Till — repeats until someone accepts" },
  kitchenNew: { label: "New kitchen ticket", hint: "Kitchen Display" },
  ready: { label: "Order ready", hint: "Till & Kitchen Display" },
};

const VOLUME_KEY = "iq-pos-sound-volumes";
const DEFAULT_VOLUMES: Record<SoundKind, number> = { incoming: 1, kitchenNew: 1, ready: 1 };

export function getSoundVolumes(): Record<SoundKind, number> {
  try {
    const saved = JSON.parse(localStorage.getItem(VOLUME_KEY) ?? "{}") as Partial<Record<SoundKind, number>>;
    const out = { ...DEFAULT_VOLUMES };
    for (const kind of Object.keys(out) as SoundKind[]) {
      const v = Number(saved[kind]);
      if (Number.isFinite(v)) out[kind] = Math.max(0, Math.min(1, v));
    }
    return out;
  } catch {
    return { ...DEFAULT_VOLUMES };
  }
}

export function setSoundVolume(kind: SoundKind, volume: number) {
  try {
    localStorage.setItem(VOLUME_KEY, JSON.stringify({ ...getSoundVolumes(), [kind]: Math.max(0, Math.min(1, volume)) }));
  } catch {
    // Private mode / storage blocked — the level just won't persist past this page.
  }
}

function tone(startTime: number, freq: number, duration: number, type: OscillatorType, peakGain: number) {
  if (peakGain <= 0) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + startTime;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export function unlockOrderAudio() {
  getAudioContext();
}

// Bright, ascending two-note chime — a new ticket just landed (Kitchen Display).
export function playNewOrderChime(volume = getSoundVolumes().kitchenNew) {
  tone(0, 880, 0.16, "sine", volume);
  tone(0.12, 1318.5, 0.24, "sine", volume);
}

// Lower, descending two-note tone — an order is fully prepped and ready.
export function playOrderReadyChime(volume = getSoundVolumes().ready) {
  tone(0, 1046.5, 0.14, "triangle", volume);
  tone(0.1, 523.25, 0.26, "triangle", volume);
}

// A customer order is waiting to be accepted on the Till — a more insistent rising triple
// (played twice) so it's distinct from the kitchen and ready tones and hard to miss at a counter.
export function playIncomingOrderAlert(volume = getSoundVolumes().incoming) {
  for (const offset of [0, 0.55]) {
    tone(offset, 784, 0.12, "square", volume * 0.5);
    tone(offset + 0.13, 988, 0.12, "square", volume * 0.5);
    tone(offset + 0.26, 1318.5, 0.2, "square", volume * 0.5);
  }
}

export const PLAY_SOUND: Record<SoundKind, (volume?: number) => void> = {
  incoming: playIncomingOrderAlert,
  kitchenNew: playNewOrderChime,
  ready: playOrderReadyChime,
};
