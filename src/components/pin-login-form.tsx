"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Delete } from "lucide-react";
import type { PinLoginState } from "@/lib/actions/pin-auth";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function PinLoginForm({
  action,
  title,
  subtitle,
}: {
  action: (prevState: PinLoginState | undefined, formData: FormData) => Promise<PinLoginState>;
  title: string;
  subtitle: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [pin, setPin] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const submittedFor = useRef("");

  // Adjusting state during render (not in an effect) in response to a prop/state change
  // is the pattern React recommends for this — see https://react.dev/learn/you-might-not-need-an-effect.
  const [lastError, setLastError] = useState(state?.error);
  if (state?.error !== lastError) {
    setLastError(state?.error);
    if (state?.error) setPin("");
  }

  useEffect(() => {
    if (pin.length === 6 && submittedFor.current !== pin) {
      submittedFor.current = pin;
      formRef.current?.requestSubmit();
    }
  }, [pin]);

  function press(digit: string) {
    if (pending) return;
    setPin((p) => (p.length < 6 ? p + digit : p));
  }

  function backspace() {
    if (pending) return;
    setPin((p) => p.slice(0, -1));
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-4 text-white">
      <div className="mb-8 text-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-neutral-400">{subtitle}</p>
      </div>

      <form ref={formRef} action={formAction}>
        <input type="hidden" name="pin" value={pin} readOnly />
      </form>

      <div className="mb-8 flex gap-3" aria-hidden>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`h-4 w-4 rounded-full border-2 transition-colors ${
              i < pin.length ? "border-teal-400 bg-teal-400" : "border-neutral-700"
            }`}
          />
        ))}
      </div>

      <div className="mb-4 h-5 text-sm">
        {state?.error ? (
          <p className="text-rose-400">{state.error}</p>
        ) : pending ? (
          <p className="text-neutral-400">Checking…</p>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {KEYS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => press(d)}
            disabled={pending}
            className="flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-900 text-2xl font-semibold text-white transition-transform hover:bg-neutral-800 active:scale-95 disabled:opacity-40"
          >
            {d}
          </button>
        ))}
        <div />
        <button
          type="button"
          onClick={() => press("0")}
          disabled={pending}
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-900 text-2xl font-semibold text-white transition-transform hover:bg-neutral-800 active:scale-95 disabled:opacity-40"
        >
          0
        </button>
        <button
          type="button"
          onClick={backspace}
          disabled={pending}
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-900 text-neutral-300 transition-transform hover:bg-neutral-800 active:scale-95 disabled:opacity-40"
        >
          <Delete className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}
