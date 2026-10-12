#!/usr/bin/env node
"use strict";

// IQ POS local print bridge — a tiny standalone program, not part of the Next.js app itself.
// Run it on any device on the same local network as the printer (recommended: directly on the
// Till, via Termux on Android — https://termux.dev, `pkg install nodejs` then
// `node local-print-bridge.js`). It listens for print requests from the Till's own browser (a
// plain HTTP call, since a browser can't open a raw socket itself) and forwards the bytes to the
// printer over a raw TCP connection on port 9100 — the long-standing "JetDirect" standard most
// thermal/receipt printers support.
//
// No external dependencies — only Node's built-in http/net modules, so there's nothing to
// `npm install` on a constrained device like a Termux shell.
//
// Usage: node local-print-bridge.js [port]   (default port: 9200)
//
// See docs/DEVELOPER_GUIDE.md §7.7 in the IQ POS repo for the full architecture.

const http = require("http");
const net = require("net");

const PORT = Number(process.argv[2]) || 9200;
const PRINT_TIMEOUT_MS = 8000;

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    // Loosened for a bridge that only ever talks to one known app on your own device/network —
    // tighten this to your exact production origin if you want to be stricter.
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(body));
}

function printToDevice(printerIp, printerPort, hexData) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Timed out connecting to ${printerIp}:${printerPort}`));
    }, PRINT_TIMEOUT_MS);

    socket.connect(printerPort, printerIp, () => {
      socket.write(Buffer.from(hexData, "hex"), (err) => {
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

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }
  if (req.method === "GET" && req.url === "/") {
    sendJson(res, 200, { ok: true, service: "iq-pos-local-print-bridge" });
    return;
  }
  if (req.method !== "POST" || req.url !== "/print") {
    sendJson(res, 404, { error: "not found" });
    return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      sendJson(res, 400, { error: "invalid JSON body" });
      return;
    }
    const { printerIp, printerPort, escposHex } = payload || {};
    if (!printerIp || !escposHex) {
      sendJson(res, 400, { error: "printerIp and escposHex are required" });
      return;
    }
    try {
      await printToDevice(printerIp, printerPort || 9100, escposHex);
      console.log(`[print] sent ${escposHex.length / 2} bytes to ${printerIp}:${printerPort || 9100}`);
      sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error(`[print] failed for ${printerIp}:${printerPort || 9100} —`, err.message);
      sendJson(res, 502, { error: err.message });
    }
  });
});

server.listen(PORT, () => {
  console.log(`IQ POS local print bridge listening on http://127.0.0.1:${PORT}`);
  console.log("Leave this running — close the terminal/Termux session and it stops.");
});
