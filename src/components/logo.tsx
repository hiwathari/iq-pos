export function Logo({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static asset, no benefit from next/image at this size */}
      <img src="/brand/iq-pos-logo.png" alt="" width={34} height={34} className="h-[34px] w-[34px] shrink-0 object-contain" />
      {showText && (
        <div className="leading-tight">
          <div className="text-[17px] font-bold tracking-tight text-neutral-900">
            IQ <span className="text-teal-600">POS</span>
          </div>
        </div>
      )}
    </div>
  );
}
