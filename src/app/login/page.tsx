import Link from "next/link";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-7 shadow-sm">
          <h1 className="mb-1 text-lg font-semibold text-neutral-900">Sign in</h1>
          <p className="mb-6 text-sm text-neutral-500">Multi-restaurant point of sale platform.</p>
          <LoginForm />
        </div>

        <div className="mt-5 flex gap-3 text-center text-xs">
          <Link
            href="/till-login"
            className="flex-1 rounded-xl border border-neutral-200 bg-white py-2.5 font-medium text-neutral-500 hover:bg-neutral-50"
          >
            Till device? Enter PIN →
          </Link>
          <Link
            href="/kitchen-login"
            className="flex-1 rounded-xl border border-neutral-200 bg-white py-2.5 font-medium text-neutral-500 hover:bg-neutral-50"
          >
            Kitchen screen? Enter PIN →
          </Link>
        </div>
      </div>
    </div>
  );
}
