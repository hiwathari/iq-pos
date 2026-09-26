"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateInvoiceDetailsAction } from "@/lib/actions/restaurants";

export function InvoiceDetailsClient({
  invoiceAddress,
  invoicePhone,
  invoiceWebsite,
  invoiceLogoUrl,
  invoiceFooterText,
}: {
  invoiceAddress: string;
  invoicePhone: string;
  invoiceWebsite: string;
  invoiceLogoUrl: string;
  invoiceFooterText: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [address, setAddress] = useState(invoiceAddress);
  const [phone, setPhone] = useState(invoicePhone);
  const [website, setWebsite] = useState(invoiceWebsite);
  const [logoUrl, setLogoUrl] = useState(invoiceLogoUrl);
  const [footerText, setFooterText] = useState(invoiceFooterText);

  function save() {
    startTransition(async () => {
      await updateInvoiceDetailsAction({
        invoiceAddress: address,
        invoicePhone: phone,
        invoiceWebsite: website,
        invoiceLogoUrl: logoUrl,
        invoiceFooterText: footerText,
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
        Printed on every invoice — address, phone, and website also feed the QR code customers can scan.
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
          <label className="mb-1.5 block text-xs font-medium text-neutral-500">Website</label>
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://alzayt.co.uk"
            className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-medium text-neutral-500">Logo URL</label>
          <input
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://…/logo.png"
            className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          />
          <p className="mt-1 text-xs text-neutral-400">A hosted image URL — printed at the top of the invoice.</p>
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
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
        >
          Save Invoice Details
        </button>
        {saved && <span className="text-sm font-medium text-emerald-600">Saved</span>}
      </div>
    </div>
  );
}
