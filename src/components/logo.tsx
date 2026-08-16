export function Logo({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <svg width="34" height="34" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
        <circle cx="17" cy="17" r="17" fill="#0F766E" />
        <path d="M17 3C17 10.732 10.732 17 3 17C3 9.268 9.268 3 17 3Z" fill="#5EEAD4" />
        <path d="M17 31C17 23.268 23.268 17 31 17C31 24.732 24.732 31 17 31Z" fill="#5EEAD4" />
      </svg>
      <div className="leading-tight">
        <div className="text-[15px] font-semibold text-neutral-900">Tasty</div>
        <div className="text-[15px] font-semibold text-neutral-900 -mt-1">Station</div>
      </div>
    </div>
  );
}
