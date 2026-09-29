import { Logo } from "@/components/logo";

export default function MyCardErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm text-center">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-7 shadow-sm">
          <h1 className="mb-1 text-lg font-semibold text-neutral-900">Link expired</h1>
          <p className="text-sm text-neutral-500">
            This sign-in link is invalid or has expired. Ask the restaurant for their loyalty sign-in page and request a new one.
          </p>
        </div>
      </div>
    </div>
  );
}
