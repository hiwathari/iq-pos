"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Link2, Pencil, Plus, Trash2, Unlink, X } from "lucide-react";
import {
  createPaymentTerminalAction,
  deletePaymentTerminalAction,
  setDefaultPaymentTerminalAction,
  togglePaymentTerminalActiveAction,
  updatePaymentTerminalAction,
} from "@/lib/actions/printers";
import { pairSumupReaderAction, saveSumupCredentialsAction, unpairSumupReaderAction } from "@/lib/actions/sumup";
import { connectTeyaTerminalAction, disconnectTeyaTerminalAction, saveTeyaCredentialsAction } from "@/lib/actions/teya";
import type { PaymentTerminal } from "@/lib/types";

export function PaymentTerminalsClient({
  terminals,
  sumupApiKey,
  sumupMerchantCode,
  teyaClientId,
  teyaClientSecret,
  teyaStoreId,
}: {
  terminals: PaymentTerminal[];
  sumupApiKey: string;
  sumupMerchantCode: string;
  teyaClientId: string;
  teyaClientSecret: string;
  teyaStoreId: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTerminal, setEditingTerminal] = useState<PaymentTerminal | null>(null);
  const [pairingTerminal, setPairingTerminal] = useState<PaymentTerminal | null>(null);
  const [connectingTeyaTerminal, setConnectingTeyaTerminal] = useState<PaymentTerminal | null>(null);
  const sumupConnected = Boolean(sumupApiKey && sumupMerchantCode);
  const teyaConnected = Boolean(teyaClientId && teyaClientSecret && teyaStoreId);

  function toggle(id: string, active: boolean) {
    startTransition(async () => {
      await togglePaymentTerminalActiveAction(id, active);
      router.refresh();
    });
  }

  function makeDefault(id: string) {
    startTransition(async () => {
      await setDefaultPaymentTerminalAction(id);
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deletePaymentTerminalAction(id);
      router.refresh();
    });
  }

  function unpair(id: string) {
    startTransition(async () => {
      await unpairSumupReaderAction(id);
      router.refresh();
    });
  }

  function disconnectTeya(id: string) {
    startTransition(async () => {
      await disconnectTeyaTerminalAction(id);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Payment Terminals</h2>
          <p className="text-sm text-neutral-500">
            Register each card machine by name (e.g. Card 1, Yellow Card) — add a logo so staff can tell them apart
            at a glance on the Till.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]"
        >
          <Plus className="h-4 w-4" /> Add Terminal
        </button>
      </div>

      <SumupAccountForm sumupApiKey={sumupApiKey} sumupMerchantCode={sumupMerchantCode} />
      <TeyaAccountForm teyaClientId={teyaClientId} teyaClientSecret={teyaClientSecret} teyaStoreId={teyaStoreId} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {terminals.map((t) => (
          <div key={t.id} className="flex items-start justify-between rounded-2xl border border-neutral-200 bg-white p-4">
            <div>
              <div className="mb-1 flex items-center gap-2">
                {t.logoUrl ? (
                  <img src={t.logoUrl} alt="" className="h-6 w-6 rounded object-contain" />
                ) : (
                  <CreditCard className="h-4 w-4 text-neutral-400" />
                )}
                <span className="font-semibold text-neutral-900">{t.name}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                    t.active ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"
                  }`}
                >
                  {t.active ? "Active" : "Disabled"}
                </span>
                {t.isDefault && (
                  <span className="inline-block rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">Default</span>
                )}
                {t.provider === "sumup" && (
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                      t.sumupReaderStatus === "paired"
                        ? "bg-blue-50 text-blue-700"
                        : t.sumupReaderStatus === "expired"
                          ? "bg-rose-50 text-rose-700"
                          : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    SumUp: {t.sumupReaderStatus ?? "processing"}
                  </span>
                )}
                {t.provider === "teya" && (
                  <span className="inline-block rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                    Teya: connected
                  </span>
                )}
              </div>
              <p className="mt-2 max-w-[20ch] text-[11px] text-neutral-400">
                {t.isDefault
                  ? "Shown in full to the Accounts login, same as Cash."
                  : "Accounts login only sees this terminal's last 14 days."}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => setEditingTerminal(t)}
                className="flex items-center justify-center rounded-lg border border-neutral-200 px-2.5 py-1 text-neutral-500 hover:bg-neutral-50"
                title="Edit name / logo"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              {t.provider === "sumup" && (
                <button
                  onClick={() => unpair(t.id)}
                  className="flex items-center justify-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                  title="Disconnect this SumUp reader"
                >
                  <Unlink className="h-3 w-3" /> Unpair
                </button>
              )}
              {t.provider === "teya" && (
                <button
                  onClick={() => disconnectTeya(t.id)}
                  className="flex items-center justify-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                  title="Disconnect this Teya terminal"
                >
                  <Unlink className="h-3 w-3" /> Disconnect
                </button>
              )}
              {!t.provider && (
                <>
                  <button
                    onClick={() => setPairingTerminal(t)}
                    disabled={!sumupConnected}
                    title={sumupConnected ? "Pair a SumUp Solo reader" : "Connect your SumUp account above first"}
                    className="flex items-center justify-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Link2 className="h-3 w-3" /> Connect SumUp
                  </button>
                  <button
                    onClick={() => setConnectingTeyaTerminal(t)}
                    disabled={!teyaConnected}
                    title={teyaConnected ? "Connect a Teya terminal" : "Connect your Teya account above first"}
                    className="flex items-center justify-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Link2 className="h-3 w-3" /> Connect Teya
                  </button>
                </>
              )}
              {!t.isDefault && (
                <button
                  onClick={() => makeDefault(t.id)}
                  className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                >
                  Make Default
                </button>
              )}
              <button
                onClick={() => toggle(t.id, !t.active)}
                className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
              >
                {t.active ? "Disable" : "Enable"}
              </button>
              <button
                onClick={() => remove(t.id)}
                className="flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-600 hover:bg-rose-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
        {terminals.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-neutral-300 py-10 text-center text-sm text-neutral-400">
            No payment terminals registered yet.
          </div>
        )}
      </div>

      {modalOpen && <TerminalModal onClose={() => setModalOpen(false)} />}
      {editingTerminal && <TerminalModal terminal={editingTerminal} onClose={() => setEditingTerminal(null)} />}
      {pairingTerminal && <PairReaderModal terminal={pairingTerminal} onClose={() => setPairingTerminal(null)} />}
      {connectingTeyaTerminal && (
        <ConnectTeyaTerminalModal terminal={connectingTeyaTerminal} onClose={() => setConnectingTeyaTerminal(null)} />
      )}
    </div>
  );
}

function TeyaAccountForm({
  teyaClientId,
  teyaClientSecret,
  teyaStoreId,
}: {
  teyaClientId: string;
  teyaClientSecret: string;
  teyaStoreId: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [clientId, setClientId] = useState(teyaClientId);
  const [clientSecret, setClientSecret] = useState(teyaClientSecret);
  const [storeId, setStoreId] = useState(teyaStoreId);

  function save() {
    startTransition(async () => {
      await saveTeyaCredentialsAction(clientId, clientSecret, storeId);
      router.refresh();
    });
  }

  return (
    <div className="mb-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
      <h3 className="mb-1 text-sm font-semibold text-neutral-900">Teya Account</h3>
      <p className="mb-3 text-xs text-neutral-500">
        Connect this restaurant&apos;s own Teya account to charge a terminal directly from the Till, instead of
        running it by hand and logging the amount.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[180px] flex-1">
          <label className="mb-1 block text-xs font-medium text-neutral-500">Client ID</label>
          <input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="cli_…"
            className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
          />
        </div>
        <div className="min-w-[180px] flex-1">
          <label className="mb-1 block text-xs font-medium text-neutral-500">Client Secret</label>
          <input
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="sec_…"
            className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
          />
        </div>
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs font-medium text-neutral-500">Store ID</label>
          <input
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            placeholder="Store UUID"
            className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
          />
        </div>
        <button
          onClick={save}
          className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function ConnectTeyaTerminalModal({ terminal, onClose }: { terminal: PaymentTerminal; onClose: () => void }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [terminalId, setTerminalId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function submit() {
    if (!terminalId.trim()) {
      setError("Enter this terminal's Teya terminal id.");
      return;
    }
    setError(null);
    setPending(true);
    startTransition(async () => {
      const result = await connectTeyaTerminalAction(terminal.id, terminalId);
      setPending(false);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Connect Teya — {terminal.name}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-3 text-sm text-neutral-500">Enter this physical terminal&apos;s id from your Teya account.</p>
        <input
          value={terminalId}
          onChange={(e) => setTerminalId(e.target.value)}
          placeholder="Terminal id"
          autoFocus
          className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        />
        {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}
        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={pending}
            className="flex-1 rounded-xl bg-[var(--brand)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "Connecting…" : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SumupAccountForm({ sumupApiKey, sumupMerchantCode }: { sumupApiKey: string; sumupMerchantCode: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [apiKey, setApiKey] = useState(sumupApiKey);
  const [merchantCode, setMerchantCode] = useState(sumupMerchantCode);

  function save() {
    startTransition(async () => {
      await saveSumupCredentialsAction(apiKey, merchantCode);
      router.refresh();
    });
  }

  return (
    <div className="mb-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
      <h3 className="mb-1 text-sm font-semibold text-neutral-900">SumUp Account</h3>
      <p className="mb-3 text-xs text-neutral-500">
        Connect this restaurant&apos;s own SumUp account to charge a paired Solo reader directly from the Till,
        instead of running it by hand and logging the amount.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-xs font-medium text-neutral-500">API Key</label>
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sup_sk_…"
            className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
          />
        </div>
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs font-medium text-neutral-500">Merchant Code</label>
          <input
            value={merchantCode}
            onChange={(e) => setMerchantCode(e.target.value)}
            placeholder="MC0X0ABC"
            className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
          />
        </div>
        <button
          onClick={save}
          className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function PairReaderModal({ terminal, onClose }: { terminal: PaymentTerminal; onClose: () => void }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function submit() {
    if (!code.trim()) {
      setError("Enter the pairing code shown on the reader.");
      return;
    }
    setError(null);
    setPending(true);
    startTransition(async () => {
      const result = await pairSumupReaderAction(terminal.id, code);
      setPending(false);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Connect SumUp — {terminal.name}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-3 text-sm text-neutral-500">
          On the Solo reader, start pairing mode — it&apos;ll show an 8-9 character code. Enter it here.
        </p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. 4WLFDSBF"
          autoFocus
          className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm uppercase outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        />
        {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}
        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={pending}
            className="flex-1 rounded-xl bg-[var(--brand)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "Pairing…" : "Pair Reader"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TerminalModal({ terminal, onClose }: { terminal?: PaymentTerminal; onClose: () => void }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [name, setName] = useState(terminal?.name ?? "");
  const [logoUrl, setLogoUrl] = useState(terminal?.logoUrl ?? "");

  function save() {
    if (!name.trim()) return;
    startTransition(async () => {
      if (terminal) await updatePaymentTerminalAction(terminal.id, name, logoUrl);
      else await createPaymentTerminalAction(name, logoUrl);
      router.refresh();
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">{terminal ? "Edit" : "Add"} Payment Terminal</h2>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Yellow Card"
              autoFocus
              className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Logo URL (optional)</label>
            <div className="flex items-center gap-2.5">
              {logoUrl ? (
                <img src={logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg object-contain" />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
                  <CreditCard className="h-4 w-4 text-neutral-400" />
                </div>
              )}
              <input
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://…"
                className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </div>
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!name.trim()}
            className="flex-1 rounded-xl bg-[var(--brand)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {terminal ? "Save Changes" : "Add Terminal"}
          </button>
        </div>
      </div>
    </div>
  );
}
