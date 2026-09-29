"use client";

import { useEffect, useState } from "react";
import { loyaltyQrDataUrl } from "@/lib/loyalty-qr";

export function MyCardQr({ code }: { code: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loyaltyQrDataUrl(code).then((url) => {
      if (!cancelled) setDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (!dataUrl) return <div className="mx-auto my-4 h-40 w-40 animate-pulse rounded-xl bg-neutral-100" />;
  return <img src={dataUrl} alt={code} className="mx-auto my-4 h-40 w-40" />;
}
