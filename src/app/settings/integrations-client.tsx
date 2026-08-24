"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { setIntegrationAction } from "@/lib/actions/printers";
import type { Integration, IntegrationProvider } from "@/lib/types";

const PROVIDERS: IntegrationProvider[] = ["Uber Eats", "Deliveroo", "Just Eat"];

export function IntegrationsClient({ integrations }: { integrations: Integration[] }) {
  const router = useRouter();

  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-900">Delivery Marketplace Integrations</h2>
      <p className="mb-3 text-sm text-neutral-500">
        Connect third-party ordering platforms. Orders placed there can be routed into your Till once each
        platform&apos;s real API credentials are added here.
      </p>
      <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          This panel stores your credentials, but live order sync requires each platform&apos;s own developer/business
          approval — that account setup happens on their side, not here.
        </span>
      </div>

      <div className="space-y-3">
        {PROVIDERS.map((provider) => (
          <IntegrationRow
            key={provider}
            provider={provider}
            existing={integrations.find((i) => i.provider === provider) ?? null}
            onSaved={() => router.refresh()}
          />
        ))}
      </div>
    </div>
  );
}

function IntegrationRow({
  provider,
  existing,
  onSaved,
}: {
  provider: IntegrationProvider;
  existing: Integration | null;
  onSaved: () => void;
}) {
  const [, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(existing?.enabled ?? false);
  const [storeId, setStoreId] = useState(existing?.storeId ?? "");
  const [apiKey, setApiKey] = useState(existing?.apiKey ?? "");

  function save(nextEnabled: boolean) {
    setEnabled(nextEnabled);
    startTransition(async () => {
      await setIntegrationAction(provider, { enabled: nextEnabled, storeId, apiKey });
      onSaved();
    });
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-semibold text-neutral-900">{provider}</span>
        <button
          onClick={() => save(!enabled)}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
            enabled ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-500"
          }`}
        >
          {enabled ? "Connected" : "Not connected"}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          onBlur={() => save(enabled)}
          placeholder="Store ID"
          className="rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
        />
        <input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onBlur={() => save(enabled)}
          placeholder="API key"
          type="password"
          className="rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
        />
      </div>
    </div>
  );
}
