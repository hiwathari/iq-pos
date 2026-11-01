import { eanModules } from "@/lib/barcode";

// An EAN-13 / EAN-8 (UPC-A is drawn as its EAN-13) as crisp SVG bars with the digits underneath
// — for printed labels. Anything that isn't a valid EAN just shows the code as text.
export function EanBarcode({ code, height = 40, className = "" }: { code: string; height?: number; className?: string }) {
  const bits = eanModules(code);
  if (!bits) return <div className={`font-mono text-[10px] ${className}`}>{code}</div>;
  const quiet = 9;
  const width = bits.length + quiet * 2;
  // Guard bars (start, centre, end) run a little longer, as on a real EAN.
  const guard = new Set<number>();
  const n = bits.length;
  for (const i of [0, 1, 2, n - 3, n - 2, n - 1]) guard.add(i);
  const mid = Math.floor(n / 2) - 2;
  for (let i = mid; i < mid + 5; i++) guard.add(i);
  return (
    <svg viewBox={`0 0 ${width} ${height + 8}`} className={className} role="img" aria-label={`Barcode ${code}`} preserveAspectRatio="none">
      <rect width={width} height={height + 8} fill="#fff" />
      {[...bits].map((b, i) =>
        b === "1" ? <rect key={i} x={quiet + i} y={0} width={1} height={guard.has(i) ? height + 4 : height} fill="#000" /> : null
      )}
      <text x={width / 2} y={height + 7.5} textAnchor="middle" fontSize={6.5} fontFamily="monospace" fill="#000">
        {code.length === 12 ? `0${code}` : code}
      </text>
    </svg>
  );
}
