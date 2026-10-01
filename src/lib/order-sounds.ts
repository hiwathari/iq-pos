"use client";

// Two short, synthesized alert tones shared by the Kitchen Display and the Till — generated with
// the Web Audio API rather than shipped as audio files, so there's nothing to host or license.
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

function tone(startTime: number, freq: number, duration: number, type: OscillatorType, peakGain: number) {
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

// Bright, ascending two-note chime — a new ticket just landed.
export function playNewOrderChime() {
  tone(0, 880, 0.16, "sine", 0.25);
  tone(0.12, 1318.5, 0.24, "sine", 0.25);
}

// Lower, descending two-note tone — an order is fully prepped and ready.
export function playOrderReadyChime() {
  tone(0, 1046.5, 0.14, "triangle", 0.22);
  tone(0.1, 523.25, 0.26, "triangle", 0.22);
}
