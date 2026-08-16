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

        <div className="mt-5 rounded-2xl border border-dashed border-neutral-300 bg-white/60 p-4 text-xs text-neutral-500">
          <div className="mb-2 font-semibold text-neutral-600">Demo accounts</div>
          <div className="space-y-1.5">
            <div className="flex justify-between gap-3">
              <span>Super Admin</span>
              <span className="font-mono text-neutral-700">super@iqpos.app / SuperAdmin123!</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Restaurant Admin</span>
              <span className="font-mono text-neutral-700">admin@tastystation.iqpos.app / Admin123!</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Staff</span>
              <span className="font-mono text-neutral-700">staff@tastystation.iqpos.app / Staff123!</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
