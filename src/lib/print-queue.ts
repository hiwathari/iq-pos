// Remembers what this device sent to printers, so a failed print is never silent: it is kept (with
// the ticket itself) until someone retries or dismisses it. Per device (localStorage) — the printers
// are on this shop's own network, and nothing here goes to our server.
//
// What "sent" means: through the HTTP print bridge a refused or unreachable printer is reported
// back, so a failure shows. Through the Till app the bytes are handed to the app, which has no way
// to say how it went yet — "sent" there means handed over, not confirmed on paper.
import { printViaLocalBridge } from "@/lib/local-print-bridge";

export interface PrintJob {
  id: string;
  at: number;
  printer: string;
  ip: string;
  port: number | null;
  // What it was, e.g. "Kitchen · order #0042".
  label: string;
  hex: string;
  status: "sent" | "failed";
  error?: string;
}

const KEY = "iq-print-jobs";
const KEEP = 30;
const TIMEOUT_MS = 8000;

let jobs: PrintJob[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) jobs = (JSON.parse(raw) as PrintJob[]).filter((j) => j && typeof j.id === "string").slice(0, KEEP);
  } catch {
    // Storage unavailable — jobs just live for this session.
  }
}

function commit(next: PrintJob[]) {
  // Failed jobs are kept; only old successful ones fall off the end.
  const failed = next.filter((j) => j.status === "failed");
  const rest = next.filter((j) => j.status !== "failed").slice(0, Math.max(0, KEEP - failed.length));
  jobs = [...failed, ...rest].sort((a, b) => b.at - a.at);
  try {
    localStorage.setItem(KEY, JSON.stringify(jobs));
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

export function getPrintJobs(): PrintJob[] {
  load();
  return jobs;
}

export function subscribePrintJobs(cb: () => void) {
  load();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

async function deliver(job: Omit<PrintJob, "status" | "error">): Promise<PrintJob> {
  try {
    await Promise.race([
      printViaLocalBridge({ printerIp: job.ip, printerPort: job.port, escposHex: job.hex }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`No answer from ${job.printer} (${job.ip}).`)), TIMEOUT_MS)),
    ]);
    return { ...job, status: "sent" };
  } catch (err) {
    return { ...job, status: "failed", error: err instanceof Error ? err.message : "Couldn't reach the printer." };
  }
}

export async function sendPrintJob(input: { printer: string; ip: string; port: number | null; label: string; hex: string }): Promise<PrintJob> {
  load();
  const result = await deliver({ id: crypto.randomUUID(), at: Date.now(), ...input });
  commit([result, ...jobs]);
  return result;
}

export async function retryPrintJob(id: string): Promise<PrintJob | null> {
  load();
  const old = jobs.find((j) => j.id === id);
  if (!old) return null;
  const result = await deliver({ id: old.id, at: Date.now(), printer: old.printer, ip: old.ip, port: old.port, label: old.label, hex: old.hex });
  commit([result, ...jobs.filter((j) => j.id !== id)]);
  return result;
}

export function dismissPrintJob(id: string) {
  load();
  commit(jobs.filter((j) => j.id !== id));
}

export function clearPrintJobs() {
  load();
  commit([]);
}
