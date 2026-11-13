import Link from "next/link";
import { Globe } from "lucide-react";
import { buildMyWebsiteAction } from "@/lib/actions/site-from-restaurant";

// Admin Dashboard: a website for the business, built free from its own IQ POS record (name, colours, logo, menu, photos,
// contact details) with a choice of restaurant designs — see lib/site/from-restaurant.ts.
export function WebsiteCard({ existingToken }: { existingToken: string | null }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
          <Globe className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Your website</h2>
          <p className="mt-0.5 max-w-xl text-sm text-neutral-600">
            Get a website made from your menu, logo and details in minutes. Pick a restaurant design, set your colours and fonts, then edit anything by clicking on it. Free.
          </p>
        </div>
      </div>
      {existingToken ? (
        <Link href={`/site/studio/${existingToken}`} className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700">
          Open my website
        </Link>
      ) : (
        <form action={buildMyWebsiteAction}>
          <button type="submit" className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700">
            Build my website
          </button>
        </form>
      )}
    </div>
  );
}
