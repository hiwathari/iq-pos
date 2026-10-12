import type { Metadata } from "next";

export const metadata: Metadata = { title: "Get the IQ POS Till App" };

// Public, unauthenticated download page for the IQ POS Till Android app (see
// docs/DEVELOPER_GUIDE.md §7.9) — reachable directly from a bare Sunmi device browser before
// anything else is set up, which is why this bypasses the staff session gate entirely (see
// CUSTOMER_FACING_PREFIXES in src/proxy.ts). The .apk itself is a static file under
// public/downloads/, not generated here.
export default function GetAppPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-6 py-16 text-center">
      <h1 className="text-2xl font-bold text-neutral-900">IQ POS Till</h1>
      <p className="mt-2 max-w-sm text-sm text-neutral-500">
        For Sunmi / Android till devices. Replaces the browser + print bridge setup with a single app.
      </p>
      <a
        href="/downloads/iq-pos-till.apk"
        download
        className="mt-6 rounded-xl bg-[#0d9488] px-6 py-3 text-sm font-semibold text-white hover:bg-[#0b7c72]"
      >
        Download APK
      </a>
      <p className="mt-6 max-w-sm text-xs text-neutral-400">
        After downloading, open the file to install — your device will ask you to allow installing apps from this
        source the first time. This is a debug build for internal use, not from the Play Store.
      </p>
    </div>
  );
}
