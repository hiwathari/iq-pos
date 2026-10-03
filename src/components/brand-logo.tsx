import { Logo } from "./logo";

// Swaps in a restaurant's own logo + name wherever the generic IQ POS mark would otherwise show
// — the login screens (once a device/browser has signed in at least once, see
// lib/auth.ts's rememberDeviceRestaurant) and the Sidebar (always known there, post-login).
// Falls back to the generic mark whenever no logo is set, so a restaurant that hasn't uploaded
// one yet sees exactly what it always did.
export function BrandLogo({
  name,
  logoUrl,
  showText = true,
  dark = false,
  className,
}: {
  name?: string | null;
  logoUrl?: string | null;
  showText?: boolean;
  // Set on a dark background (e.g. the PIN login screens) so the restaurant name is still
  // readable — the generic Logo fallback already colors its own text for a light background.
  dark?: boolean;
  className?: string;
}) {
  if (!logoUrl) return <Logo showText={showText} className={className} />;

  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <img src={logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg bg-white object-contain" />
      {showText && name && (
        <div className={`truncate text-[17px] font-bold tracking-tight ${dark ? "text-white" : "text-neutral-900"}`}>{name}</div>
      )}
    </div>
  );
}
