"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateInvoiceDetailsAction } from "@/lib/actions/restaurants";
import { PhotoUpload } from "@/components/icon-picker";

export function InvoiceDetailsClient({
  invoiceAddress,
  invoicePhone,
  invoiceEmail,
  invoiceWebsite,
  invoiceLogoUrl,
  invoiceFooterText,
  returnsPolicy,
  invoiceQrEnabled,
}: {
  invoiceAddress: string;
  invoicePhone: string;
  invoiceEmail: string;
  invoiceWebsite: string;
  invoiceLogoUrl: string;
  invoiceFooterText: string;
  returnsPolicy: string;
  invoiceQrEnabled: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [address, setAddress] = useState(invoiceAddress);
  const [phone, setPhone] = useState(invoicePhone);
  const [email, setEmail] = useState(invoiceEmail);
  const [website, setWebsite] = useState(invoiceWebsite);
  const [logoUrl, setLogoUrl] = useState(invoiceLogoUrl);
  const [footerText, setFooterText] = useState(invoiceFooterText);
  const [policy, setPolicy] = useState(returnsPolicy);
  const [qrOn, setQrOn] = useState(invoiceQrEnabled);

  function save() {
    startTransition(async () => {
      await updateInvoiceDetailsAction({
        invoiceAddress: address,
        invoicePhone: phone,
        invoiceEmail: email,
        invoiceWebsite: website,
        invoiceLogoUrl: logoUrl,
        invoiceFooterText: footerText,
        returnsPolicy: policy,
        invoiceQrEnabled: qrOn,
      });
      router.refresh();
      setSaved(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-900">Invoice Details</h2>
      <p className="mb-4 text-sm text-neutral-500">
        Printed on every receipt and invoice: your logo, address, phone, email and website, the footer message, and (if switched on) a QR code customers scan to open their invoice online.
      </p>
      <div className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-medium text-neutral-500">Restaurant Address</label>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={2}
            placeholder="12 High Street, London, EC1A 1AA"
            className="w-full resize-none rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-neutral-500">Phone Number</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+44 20 0000 0000"
            className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-neutral-500">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="hello@restaurant.com"
            className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-neutral-500">Website</label>
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://restaurant.com"
            className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-medium text-neutral-500">Logo</label>
          <PhotoUpload url={logoUrl.trim()} onChange={setLogoUrl} label="Upload logo" />
          <input
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="…or paste a link https://…/logo.png"
            aria-label="Logo link"
            className="mt-2 w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          />
          <p className="mt-1 text-xs text-neutral-400">Upload a picture (a simple, dark-on-white logo prints best) — shown at the top of receipts, invoices and the sign-in screens. Press Save below.</p>
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-medium text-neutral-500">QR code on receipts</label>
          <button
            type="button"
            onClick={() => setQrOn((v) => !v)}
            aria-pressed={qrOn}
            className={`flex w-full max-w-xs items-center justify-between rounded-xl border px-3.5 py-2.5 text-sm font-medium ${qrOn ? "border-teal-500 bg-teal-50 text-teal-700" : "border-neutral-200 text-neutral-500"}`}
          >
            <span>QR code {qrOn ? "On" : "Off"}</span>
            <span className={`relative h-5 w-9 rounded-full transition-colors ${qrOn ? "bg-teal-500" : "bg-neutral-300"}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${qrOn ? "translate-x-4" : "translate-x-0.5"}`} />
            </span>
          </button>
          <p className="mt-1 text-xs text-neutral-400">A QR code at the bottom of the printed receipt that opens the customer&apos;s invoice online (view, share or save as PDF). Press Save below.</p>
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-medium text-neutral-500">Invoice Footer Text</label>
          <textarea
            value={footerText}
            onChange={(e) => setFooterText(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-medium text-neutral-500">Returns Policy (optional)</label>
          <textarea
            value={policy}
            onChange={(e) => setPolicy(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder="Exchange or refund within 28 days with this receipt."
            className="w-full resize-none rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          />
          <p className="mt-1 text-xs text-neutral-400">Printed under the totals on receipts and invoices.</p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          className="rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]"
        >
          Save Invoice Details
        </button>
        {saved && <span className="text-sm font-medium text-emerald-600">Saved</span>}
      </div>
    </div>
  );
}
