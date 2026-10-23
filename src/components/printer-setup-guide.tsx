"use client";

import { useState } from "react";
import { Check, Copy, Download, LoaderCircle, MonitorSmartphone, Router, Terminal } from "lucide-react";

// The printer setup kit: the steps, the one-line install commands for the print bridge, the
// finder/test commands and the downloads — shown on Super Admin → Printers and under Settings →
// Printers. The scripts themselves are static files in public/downloads (served at
// pos.luvder.com/downloads/…); the commands always point at the live POS domain because that's
// where the installers fetch the bridge from.
const POS_ORIGIN = "https://pos.luvder.com";

type Platform = "android" | "windows" | "mac" | "manual";

const PLATFORMS: { id: Platform; label: string }[] = [
  { id: "android", label: "Android (Termux)" },
  { id: "windows", label: "Windows" },
  { id: "mac", label: "Mac / Linux" },
  { id: "manual", label: "Manual" },
];

const INSTALL: Record<Platform, { before: string; command: string; after: string; dir: string }> = {
  android: {
    before: "Install Termux from F-Droid (the Play Store version is out of date), open it, and run:",
    command: `pkg install -y curl && curl -fsSL ${POS_ORIGIN}/downloads/install-print-bridge.sh | sh`,
    after: "To start the bridge automatically when the Till turns on, also install Termux:Boot from F-Droid and open it once.",
    dir: "~/iq-print-bridge",
  },
  windows: {
    before: "Open PowerShell (Start → type PowerShell) and run:",
    command: `irm ${POS_ORIGIN}/downloads/install-print-bridge.ps1 | iex`,
    after: "It installs Node.js if needed, and starts the bridge hidden every time you sign in to Windows.",
    dir: "$env:USERPROFILE\\iq-print-bridge",
  },
  mac: {
    before: "Install Node.js (LTS) from nodejs.org, then open Terminal and run:",
    command: `curl -fsSL ${POS_ORIGIN}/downloads/install-print-bridge.sh | sh`,
    after: "On a Mac it starts at login (launchd); on Linux it runs as a systemd user service where available.",
    dir: "~/iq-print-bridge",
  },
  manual: {
    before: "Download iq-print-bridge.js below onto the Till device, then in a terminal in that folder run:",
    command: "node iq-print-bridge.js",
    after: "Leave the window open — closing it stops the bridge. Needs Node.js 18 or newer.",
    dir: ".",
  },
};

function CopyLine({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-stretch overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre px-3 py-2.5 font-mono text-[13px] text-emerald-200">{command}</code>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(command).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="flex shrink-0 items-center gap-1 border-l border-neutral-800 px-3 text-xs font-semibold text-neutral-300 hover:bg-neutral-800"
        aria-label="Copy command"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

// Checks what can print from *this* device: the IQ POS Till app's built-in bridge, or the print
// bridge on 127.0.0.1. On any other device (a laptop doing setup) "nothing found" is expected.
function DeviceCheck() {
  const [state, setState] = useState<"idle" | "checking" | "app" | "bridge" | "none">("idle");
  const [version, setVersion] = useState("");

  async function check() {
    setState("checking");
    if (window.AndroidPrintBridge) {
      setState("app");
      return;
    }
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 2500);
      const res = await fetch("http://127.0.0.1:9200/", { signal: controller.signal });
      window.clearTimeout(timer);
      const json = (await res.json()) as { ok?: boolean; version?: string };
      setVersion(json.version ?? "1.x");
      setState(json.ok ? "bridge" : "none");
    } catch {
      setState("none");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3">
      <button
        type="button"
        onClick={check}
        disabled={state === "checking"}
        className="flex min-h-10 items-center gap-2 rounded-lg border border-neutral-200 px-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
      >
        {state === "checking" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <MonitorSmartphone className="h-4 w-4" />}
        Check this device
      </button>
      <span className="text-sm text-neutral-600">
        {state === "idle" && "Open this page on the Till and check it can print."}
        {state === "checking" && "Checking…"}
        {state === "app" && <span className="font-semibold text-emerald-700">IQ POS Till app found — printing is built in.</span>}
        {state === "bridge" && <span className="font-semibold text-emerald-700">Print bridge {version} is running on this device.</span>}
        {state === "none" && (
          <span className="text-amber-700">No print bridge on this device. That&apos;s expected on a laptop — run the check on the Till itself.</span>
        )}
      </span>
    </div>
  );
}

export function PrinterSetupGuide() {
  const [platform, setPlatform] = useState<Platform>("android");
  const install = INSTALL[platform];
  const node = platform === "windows" ? `node "${install.dir}\\iq-print-bridge.js"` : `node ${install.dir}/iq-print-bridge.js`;

  return (
    <div className="space-y-5">
      <ol className="space-y-3">
        {[
          <>
            <b>Connect the printer</b> to the restaurant&apos;s WiFi or network cable. Its IP address is on its self-test page
            (usually: hold the feed button while switching it on) — or use <i>find</i> below.
          </>,
          <>
            <b>Add it</b> with <i>Add Printer / Display</i>: station Receipt or Kitchen, connection Network/WiFi, and its IP address
            (port 9100 is assumed — write <code className="font-mono">192.168.1.50:9101</code> if yours differs). Already added? Use{" "}
            <i>Connect Local Network Print</i> on it instead.
          </>,
          <>
            <b>Give the Till a way to print.</b> On a Sunmi / Android Till, install the{" "}
            <a href="/get" className="font-semibold text-teal-700 hover:underline">
              IQ POS Till app
            </a>{" "}
            — printing is built in, nothing else to install. If the Till runs in a browser instead, install the print bridge
            on it with the command below.
          </>,
          <>
            <b>Turn on &ldquo;Use for Till auto-print&rdquo;</b> for the receipt printer.
          </>,
          <>
            <b>On the Till</b>, tap <i>Test Print</i> on the printer. It only works on the device with the app or bridge —
            from a laptop it will always say it can&apos;t reach the bridge.
          </>,
        ].map((step, i) => (
          <li key={i} className="flex gap-3 text-sm leading-relaxed text-neutral-700">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--brand,#0B8584)] text-xs font-bold text-white">{i + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-900">
          <Terminal className="h-4 w-4 text-neutral-500" /> Install the print bridge (browser Tills only)
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlatform(p.id)}
              className={`min-h-9 rounded-lg px-3 text-sm font-semibold ${platform === p.id ? "bg-neutral-900 text-white" : "border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="mb-2 text-sm text-neutral-600">{install.before}</p>
        <CopyLine command={install.command} />
        <p className="mt-2 text-xs text-neutral-500">{install.after}</p>

        <div className="mt-4 grid gap-3">
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <Router className="h-3.5 w-3.5" /> Find printers on the network
            </div>
            <CopyLine command={`${node} find`} />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Print a test page straight to a printer</div>
            <CopyLine command={`${node} test 192.168.1.50`} />
          </div>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          On some Android versions Termux can&apos;t read the network — then give it yours: <code className="font-mono">find 192.168.1</code>. Is the
          bridge running? Open <code className="font-mono">http://127.0.0.1:9200</code> in the Till&apos;s browser — it should say{" "}
          <code className="font-mono">&quot;ok&quot;:true</code>.
        </p>
      </div>

      <DeviceCheck />

      <div className="flex flex-wrap gap-2">
        {[
          { href: "/downloads/iq-print-bridge.js", label: "iq-print-bridge.js" },
          { href: "/downloads/install-print-bridge.sh", label: "install-print-bridge.sh" },
          { href: "/downloads/install-print-bridge.ps1", label: "install-print-bridge.ps1" },
          { href: "/get", label: "IQ POS Till app (Android)" },
        ].map((d) => (
          <a
            key={d.href}
            href={d.href}
            {...(d.href.startsWith("/downloads") ? { download: true } : {})}
            className="flex min-h-10 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            <Download className="h-4 w-4 text-neutral-400" /> {d.label}
          </a>
        ))}
      </div>

      <details className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600 [&_summary::-webkit-details-marker]:hidden">
        <summary className="cursor-pointer list-none font-semibold text-neutral-900">If printing doesn&apos;t work</summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>Test Print from a laptop or office PC always fails — the bridge only listens on the Till it runs on.</li>
          <li>&ldquo;Couldn&apos;t reach the local print bridge&rdquo; on the Till: the bridge isn&apos;t running. Run the install command again (it repairs itself) or reopen Termux.</li>
          <li>The bridge runs but nothing prints: check the IP with <i>find</i>, then <i>test</i>. If test works, re-check the IP saved in IQ POS.</li>
          <li>The printer&apos;s IP keeps changing: reserve a fixed IP for it in the router (DHCP reservation), then save that IP.</li>
          <li>Chrome shows a &ldquo;private network&rdquo; warning in the console: update the bridge by running the install command again.</li>
        </ul>
      </details>
    </div>
  );
}
