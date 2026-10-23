#!/usr/bin/env node
"use strict";

// IQ POS print bridge — a tiny standalone program, not part of the Next.js app itself. Served at
// https://pos.luvder.com/downloads/iq-print-bridge.js and installed by install-print-bridge.sh /
// install-print-bridge.ps1 next to it.
//
// Run it on the device the Till's browser runs on (a Sunmi/Android Till via Termux, or a
// Windows/Mac/Linux PC). It listens for print requests from the Till page (a plain HTTP call to
// 127.0.0.1, since a browser can't open a raw socket itself) and forwards the bytes to the
// printer over a raw TCP connection on port 9100 — the long-standing "JetDirect" standard most
// thermal/receipt printers support. The IQ POS Till Android app has this built in, so it doesn't
// need the bridge at all.
//
// No external dependencies — only Node's built-in modules, so there's nothing to `npm install`.
//
// Usage:
//   node iq-print-bridge.js [port]              Start the bridge (default port 9200)
//   node iq-print-bridge.js find [192.168.1]    List printers on the network (port 9100 open)
//   node iq-print-bridge.js test <ip> [port]    Print a test page straight to a printer
//
// See docs/DEVELOPER_GUIDE.md §7.8 in the IQ POS repo for the full architecture.

const http = require("http");
const net = require("net");
const os = require("os");

const VERSION = "2.0.0";
const PRINT_TIMEOUT_MS = 8000;

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    // Loosened for a bridge that only ever talks to one known app on your own device/network —
    // tighten this to your exact production origin if you want to be stricter.
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    // Required for Chrome's Private Network Access policy: an HTTPS page (the Till, served from
    // the production domain) calling an http://127.0.0.1 endpoint sends a preflight OPTIONS first
    // and Chrome silently fails the real request ("Failed to fetch", no network error logged
    // server-side) unless the preflight response includes this exact header.
    "Access-Control-Allow-Private-Network": "true",
  });
  res.end(JSON.stringify(body));
}

function printToDevice(printerIp, printerPort, bytes) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Timed out connecting to ${printerIp}:${printerPort}`));
    }, PRINT_TIMEOUT_MS);

    socket.connect(printerPort, printerIp, () => {
      socket.write(bytes, (err) => {
        clearTimeout(timer);
        if (err) {
          socket.destroy();
          reject(err);
          return;
        }
        socket.end();
      });
    });
    socket.on("close", () => resolve());
    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function startServer(port) {
  const server = http.createServer((req, res) => {
    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }
    if (req.method === "GET" && req.url === "/") {
      sendJson(res, 200, { ok: true, service: "iq-pos-local-print-bridge", version: VERSION });
      return;
    }
    if (req.method !== "POST" || req.url !== "/print") {
      sendJson(res, 404, { error: "not found" });
      return;
    }

    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 4 * 1024 * 1024) req.destroy();
    });
    req.on("end", async () => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        sendJson(res, 400, { error: "invalid JSON body" });
        return;
      }
      const { printerIp, printerPort, escposHex } = payload || {};
      if (!printerIp || !escposHex || !/^[0-9a-f]*$/i.test(escposHex)) {
        sendJson(res, 400, { error: "printerIp and escposHex are required" });
        return;
      }
      try {
        await printToDevice(printerIp, printerPort || 9100, Buffer.from(escposHex, "hex"));
        console.log(`[print] sent ${escposHex.length / 2} bytes to ${printerIp}:${printerPort || 9100}`);
        sendJson(res, 200, { ok: true });
      } catch (err) {
        console.error(`[print] failed for ${printerIp}:${printerPort || 9100} —`, err.message);
        sendJson(res, 502, { error: err.message });
      }
    });
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Port ${port} is already in use — the bridge is probably already running. Check http://127.0.0.1:${port}`);
    } else {
      console.error(err.message);
    }
    process.exit(1);
  });

  // Loopback only: the Till page on this same device is the only thing that should reach it.
  server.listen(port, "127.0.0.1", () => {
    console.log(`IQ POS print bridge ${VERSION} listening on http://127.0.0.1:${port}`);
    console.log("Leave this running — closing this window stops it.");
  });
}

// The /24 networks this device is on, e.g. ["192.168.1"]. On some Android versions Termux isn't
// allowed to read network interfaces — then pass the network yourself: `find 192.168.1`.
function localSubnets() {
  try {
    const out = new Set();
    for (const list of Object.values(os.networkInterfaces())) {
      for (const a of list || []) {
        if (a.family === "IPv4" && !a.internal) out.add(a.address.split(".").slice(0, 3).join("."));
      }
    }
    return [...out];
  } catch {
    return [];
  }
}

function portOpen(ip, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, ip);
  });
}

async function findPrinters(subnetArg, port) {
  const subnets = subnetArg ? [subnetArg.replace(/\.$/, "").split(".").slice(0, 3).join(".")] : localSubnets();
  if (subnets.length === 0) {
    console.log("Couldn't read this device's network. Run it with your network, e.g.:  node iq-print-bridge.js find 192.168.1");
    process.exit(1);
  }
  const found = [];
  for (const subnet of subnets) {
    console.log(`Looking for printers on ${subnet}.1–254 (port ${port})…`);
    const ips = Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`);
    // 64 at a time keeps a phone's network stack happy and still finishes in a few seconds.
    for (let i = 0; i < ips.length; i += 64) {
      const batch = ips.slice(i, i + 64);
      const results = await Promise.all(batch.map((ip) => portOpen(ip, port, 600)));
      results.forEach((open, j) => open && found.push(batch[j]));
    }
  }
  if (found.length === 0) {
    console.log("No printers found. Check the printer is switched on and on the same WiFi/network as this device.");
  } else {
    console.log(`\nFound ${found.length} printer${found.length === 1 ? "" : "s"}:`);
    for (const ip of found) console.log(`  ${ip}   →  enter this IP in IQ POS, then:  node iq-print-bridge.js test ${ip}`);
  }
}

function testPage(ip, port) {
  const ESC = 0x1b;
  const GS = 0x1d;
  const text = (s) => Buffer.from(s, "latin1");
  const now = new Date().toLocaleString();
  return Buffer.concat([
    Buffer.from([ESC, 0x40]), // initialise
    Buffer.from([ESC, 0x61, 0x01]), // centre
    Buffer.from([ESC, 0x45, 0x01, GS, 0x21, 0x11]), // bold, double size
    text("IQ POS\n"),
    Buffer.from([GS, 0x21, 0x00, ESC, 0x45, 0x00]),
    text("Test print\n\n"),
    Buffer.from([ESC, 0x61, 0x00]), // left
    text(`Printer: ${ip}:${port}\n`),
    text(`Bridge:  ${VERSION}\n`),
    text(`Time:    ${now}\n\n`),
    text("If you can read this, the printer\nworks with IQ POS. Next: turn on\n\"Use for Till auto-print\" for it.\n"),
    Buffer.from([ESC, 0x64, 0x04]), // feed 4 lines
    Buffer.from([GS, 0x56, 0x42, 0x00]), // cut
  ]);
}

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === "find") {
    await findPrinters(a, Number(b) || 9100);
    return;
  }
  if (cmd === "test") {
    if (!a) {
      console.log("Usage: node iq-print-bridge.js test <printer-ip> [port]");
      process.exit(1);
    }
    const port = Number(b) || 9100;
    try {
      await printToDevice(a, port, testPage(a, port));
      console.log(`Test page sent to ${a}:${port}.`);
    } catch (err) {
      console.error(`Couldn't print to ${a}:${port} — ${err.message}`);
      process.exit(1);
    }
    return;
  }
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "--help" || cmd === "-h" || cmd === "help") {
    console.log("node iq-print-bridge.js [port] | find [subnet] | test <ip> [port]");
    return;
  }
  startServer(Number(cmd) || 9200);
}

main();
