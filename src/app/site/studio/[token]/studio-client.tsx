"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { previewCouponAction, runJobAction, startPurchaseAction } from "@/lib/actions/site-builder";
import { BUILD_PENCE, CHANGE_PENCE, formatPence } from "@/lib/site/builder-pricing";

const GrapesEditor = dynamic(() => import("./grapes-editor"), { ssr: false, loading: () => <p className="py-10 text-center text-white/50">Opening the editor…</p> });

interface Props {
  token: string;
  name: string;
  status: "awaiting_payment" | "paid" | "generating" | "ready" | "failed";
  hasSite: boolean;
  credit: { kind: "build" | "change"; instruction: string | null } | null;
  lastError: string | null;
  html: string;
  css: string;
  previewSrc: string;
  paymentsEnabled: boolean;
  paymentChecked: boolean | null;
  cancelled: boolean;
  studioLicense: string;
}

function CouponBox({ kind, coupon, setCoupon, onPrice }: { kind: "build" | "change"; coupon: string; setCoupon: (v: string) => void; onPrice: (label: string | null) => void }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-4">
      <label className="mb-1.5 block text-xs font-medium text-white/50">Have a code?</label>
      <div className="flex gap-2">
        <input
          value={coupon}
          onChange={(e) => {
            setCoupon(e.target.value);
            setMessage(null);
            onPrice(null);
          }}
          placeholder="Enter code"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 uppercase tracking-wider outline-none placeholder:normal-case placeholder:tracking-normal focus:border-teal-300/60"
        />
        <button
          type="button"
          disabled={!coupon.trim() || pending}
          onClick={() =>
            start(async () => {
              const r = await previewCouponAction(coupon, kind);
              setMessage(r.ok ? { ok: true, text: r.label } : { ok: false, text: r.error });
              onPrice(r.ok ? r.label : null);
            })
          }
          className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold hover:border-white/30 disabled:opacity-40"
        >
          Apply
        </button>
      </div>
      {message && <p className={`mt-2 text-sm ${message.ok ? "text-teal-300" : "text-rose-300"}`}>{message.text}</p>}
    </div>
  );
}

export function StudioClient(props: Props) {
  const { token, name, status, hasSite, credit, lastError, html, css, previewSrc, paymentsEnabled, paymentChecked, cancelled, studioLicense } = props;
  const router = useRouter();
  const [tab, setTab] = useState<"preview" | "edit" | "ask">("preview");
  const [coupon, setCoupon] = useState("");
  const [couponLabel, setCouponLabel] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(lastError);
  const started = useRef(false);

  // Something has been paid for and is waiting: run it now (and again only on an explicit retry).
  const shouldRun = !!credit && !lastError && status !== "generating";
  useEffect(() => {
    if (!shouldRun || started.current) return;
    started.current = true;
    setRunning(true);
    runJobAction(token)
      .then((r) => {
        if (!r.ok) setRunError(r.error);
      })
      .catch(() => setRunError("Something went wrong — please try again."))
      .finally(() => {
        setRunning(false);
        router.refresh();
      });
  }, [shouldRun, token, router]);

  function retry() {
    setRunError(null);
    setRunning(true);
    runJobAction(token)
      .then((r) => {
        if (!r.ok) setRunError(r.error);
      })
      .catch(() => setRunError("Something went wrong — please try again."))
      .finally(() => {
        setRunning(false);
        router.refresh();
      });
  }

  function purchase(kind: "build" | "change") {
    setError(null);
    start(async () => {
      const r = await startPurchaseAction(token, kind, { instruction: kind === "change" ? instruction : undefined, coupon: coupon.trim() || undefined }).catch(() => ({ ok: false as const, error: "Couldn't reach the server — try again." }));
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (r.redirect) {
        window.location.href = r.redirect;
        return;
      }
      started.current = false;
      setInstruction("");
      router.refresh();
    });
  }

  const writing = running || status === "generating";

  return (
    <div>
      <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{name}</h1>

      {paymentChecked === false && (
        <p className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">We couldn&apos;t confirm your payment yet. If you were charged, refresh this page in a minute.</p>
      )}
      {cancelled && <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/70">Payment cancelled — you haven&apos;t been charged.</p>}

      {writing && (
        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-teal-300" />
          <p className="mt-4 font-display text-xl font-bold">{credit?.kind === "change" || hasSite ? "Making your change…" : "Writing your website…"}</p>
          <p className="mt-2 text-sm text-white/50">This takes about a minute. Keep this page open.</p>
        </div>
      )}

      {!writing && runError && (
        <div className="mt-8 rounded-2xl border border-rose-300/30 bg-rose-300/[0.06] p-6">
          <p className="flex items-center gap-2 font-semibold text-rose-200">
            <TriangleAlert className="h-5 w-5" /> The AI couldn&apos;t finish this one
          </p>
          <p className="mt-2 text-sm text-white/60">{runError}</p>
          {credit && <p className="mt-2 text-sm text-white/60">You&apos;ve already paid, so trying again is free.</p>}
          {credit && (
            <button onClick={retry} className="mt-4 rounded-full bg-teal-400 px-5 py-2.5 text-sm font-semibold text-[#04201F] hover:bg-teal-300">
              Try again
            </button>
          )}
        </div>
      )}

      {!writing && !runError && !hasSite && !credit && (
        <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-white/10 bg-white/[0.03] p-7">
          <h2 className="font-display text-2xl font-bold">Build my website</h2>
          <p className="mt-2 text-white/60">
            Our AI writes your one-page website from your brief in about a minute. You then preview it, edit anything by clicking on it (free), and can ask for changes ({formatPence(CHANGE_PENCE)} each).
          </p>
          <p className="mt-5 font-display text-4xl font-extrabold">
            {formatPence(BUILD_PENCE)} <span className="text-base font-medium text-white/40">one-off</span>
          </p>
          {couponLabel && <p className="mt-1 text-sm text-teal-300">With your code: {couponLabel}</p>}
          <CouponBox kind="build" coupon={coupon} setCoupon={setCoupon} onPrice={setCouponLabel} />
          {!paymentsEnabled && !coupon.trim() && <p className="mt-3 text-sm text-amber-200">Card payments aren&apos;t switched on yet — if you have a code, enter it above.</p>}
          {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
          <button
            onClick={() => purchase("build")}
            disabled={busy}
            className="mt-6 w-full rounded-full bg-teal-400 px-6 py-3.5 font-semibold text-[#04201F] hover:bg-teal-300 disabled:opacity-60"
          >
            {busy ? "One moment…" : couponLabel === "Free" ? "Build my website — free" : "Pay & build my website"}
          </button>
          <p className="mt-3 text-center text-xs text-white/40">Secure card payment by Stripe.</p>
        </div>
      )}

      {!writing && hasSite && (
        <div className="mt-8">
          <div className="mb-5 flex flex-wrap gap-2">
            {(
              [
                ["preview", "Preview"],
                ["edit", "Edit by hand (free)"],
                ["ask", `Ask AI for a change · ${formatPence(CHANGE_PENCE)}`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`rounded-full px-5 py-2.5 text-sm font-semibold ${tab === key ? "bg-white text-[#07090D]" : "border border-white/15 text-white/70 hover:border-white/30"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "preview" && (
            <div>
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-white">
                <iframe title="Your website" src={previewSrc} className="h-[78vh] w-full" />
              </div>
              <p className="mt-3 text-sm text-white/50">
                Happy with it? Reply to our email and we&apos;ll put it live on your own address. This link is private — only people you send it to can open it:{" "}
                <a href={previewSrc} target="_blank" rel="noreferrer" className="text-teal-300 underline-offset-2 hover:underline">
                  open full screen
                </a>
              </p>
            </div>
          )}

          {tab === "edit" && <GrapesEditor token={token} html={html} css={css} licenseKey={studioLicense} onSaved={() => router.refresh()} />}

          {tab === "ask" && (
            <div className="max-w-2xl rounded-2xl border border-white/10 bg-white/[0.03] p-7">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold">
                <Sparkles className="h-5 w-5 text-teal-300" /> Ask the AI to change something
              </h2>
              <p className="mt-2 text-sm text-white/60">For example: &ldquo;Make the top section darker and add a catering section&rdquo; or &ldquo;Change the opening hours to 9–5 on Sundays&rdquo;. Each request is {formatPence(CHANGE_PENCE)}.</p>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={4}
                maxLength={1500}
                placeholder="What would you like changed?"
                className="mt-4 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 outline-none placeholder:text-white/30 focus:border-teal-300/60"
              />
              <CouponBox kind="change" coupon={coupon} setCoupon={setCoupon} onPrice={setCouponLabel} />
              {couponLabel && <p className="mt-1 text-sm text-teal-300">With your code: {couponLabel}</p>}
              {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
              <button
                onClick={() => purchase("change")}
                disabled={busy || instruction.trim().length < 5}
                className="mt-5 rounded-full bg-teal-400 px-6 py-3 font-semibold text-[#04201F] hover:bg-teal-300 disabled:opacity-50"
              >
                {busy ? "One moment…" : couponLabel === "Free" ? "Make this change — free" : `Pay ${formatPence(CHANGE_PENCE)} & make this change`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
