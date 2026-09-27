"use client";

import { useEffect, useState } from "react";
import type { LoyaltyMember } from "@/lib/types";
import { loyaltyQrDataUrl } from "@/lib/loyalty-qr";
import { CreditCard, Mail, Phone, QrCode, X } from "lucide-react";

export function LoyaltyClient({ members }: { members: LoyaltyMember[] }) {
  const [qrFor, setQrFor] = useState<LoyaltyMember | null>(null);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-900">Loyalty Cards</h1>
        <p className="text-sm text-neutral-400">
          Enrolled at the Till by phone or email — each member gets a 7-character card code with a scannable QR.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wide text-neutral-400">
            <tr>
              <th className="px-5 py-3">Member</th>
              <th className="px-5 py-3">Contact</th>
              <th className="px-5 py-3">Card Code</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {members.map((m) => (
              <tr key={m.id}>
                <td className="flex items-center gap-3 px-5 py-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand-light)] text-[var(--brand-dark)]">
                    <CreditCard className="h-4 w-4" />
                  </span>
                  <span className="font-medium text-neutral-800">{m.name || "Unnamed"}</span>
                </td>
                <td className="px-5 py-3 text-neutral-500">
                  <span className="flex items-center gap-1.5">
                    {m.contactType === "email" ? <Mail className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
                    {m.contactValue}
                  </span>
                </td>
                <td className="px-5 py-3 font-mono font-semibold text-neutral-800">{m.code}</td>
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => setQrFor(m)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-50 hover:text-[var(--brand-dark)]"
                  >
                    <QrCode className="h-3.5 w-3.5" /> View QR
                  </button>
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-neutral-400">
                  No loyalty members yet — enroll one from the Till.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {qrFor && <QrModal member={qrFor} onClose={() => setQrFor(null)} />}
    </div>
  );
}

function QrModal({ member, onClose }: { member: LoyaltyMember; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loyaltyQrDataUrl(member.code).then((url) => {
      if (!cancelled) setDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [member.code]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-xs rounded-2xl bg-white p-6 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Loyalty Card</h2>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        {dataUrl ? (
          <img src={dataUrl} alt={member.code} className="mx-auto mb-4 h-48 w-48" />
        ) : (
          <div className="mx-auto mb-4 flex h-48 w-48 items-center justify-center text-sm text-neutral-400">Generating…</div>
        )}
        <div className="font-mono text-lg font-bold tracking-wide text-neutral-900">{member.code}</div>
        <div className="mt-1 text-sm text-neutral-500">{member.name || member.contactValue}</div>
      </div>
    </div>
  );
}
