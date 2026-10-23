import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The print bridge and its installers (public/downloads) are fetched by `curl … | sh` and
  // PowerShell's `irm … | iex`, which want text — Vercel would otherwise serve the .ps1 as
  // application/octet-stream. no-cache so a fixed script reaches Tills on the next install.
  headers() {
    return [
      {
        source: "/downloads/:file(.+\\.(?:sh|ps1|js))",
        headers: [
          { key: "Content-Type", value: "text/plain; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache" },
        ],
      },
    ];
  },
};

export default nextConfig;
