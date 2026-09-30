"use client";

import { useState } from "react";
import { formatMoney, formatOrderTimestamp, orderBreakdown, type Order } from "@/lib/types";
import { Printer, Share2, ChefHat } from "lucide-react";

type InvoiceOrder = Pick<
  Order,
  | "orderNumber"
  | "createdAt"
  | "status"
  | "tableNumber"
  | "channel"
  | "items"
  | "extraDiscount"
  | "couponCode"
  | "couponDiscount"
  | "payments"
  | "paymentMethod"
  | "cashReceived"
  | "customerName"
  | "customerPhone"
  | "customerAddress"
>;

export function InvoiceClient({
  order,
  restaurantName,
  currencySymbol,
  invoiceAddress,
  invoicePhone,
  invoiceWebsite,
  invoiceLogoUrl,
  invoiceFooterText,
}: {
  order: InvoiceOrder;
  restaurantName: string;
  currencySymbol: string;
  invoiceAddress?: string | null;
  invoicePhone?: string | null;
  invoiceWebsite?: string | null;
  invoiceLogoUrl?: string | null;
  invoiceFooterText: string;
}) {
  const [shared, setShared] = useState(false);
  const { subtotal, discount, tax, total } = orderBreakdown(order);
  const paymentLines = order.payments?.length ? order.payments : order.paymentMethod ? [{ method: order.paymentMethod, amount: total }] : [];
  const cashLine = paymentLines.find((p) => p.method === "Cash");
  const changeDue = cashLine && order.cashReceived ? Math.max(0, order.cashReceived - cashLine.amount) : 0;

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${restaurantName} — Invoice #${order.orderNumber}`, url });
        return;
      } catch {
        // User cancelled the share sheet — fall through to clipboard copy.
      }
    }
    await navigator.clipboard.writeText(url).catch(() => {});
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-white px-6 py-8 print:p-0">
      <div className="mb-6 flex items-center justify-end gap-2 print:hidden">
        <button
          onClick={share}
          className="flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3.5 py-2 text-sm font-semibold text-neutral-600 hover:bg-neutral-50"
        >
          <Share2 className="h-4 w-4" /> {shared ? "Link Copied!" : "Share"}
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-xl bg-[var(--brand)] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]"
        >
          <Printer className="h-4 w-4" /> Download PDF
        </button>
      </div>

      <div className="mb-6 text-center">
        {invoiceLogoUrl && <img src={invoiceLogoUrl} alt="" className="mx-auto mb-2 max-h-16 max-w-[140px]" />}
        <div className="flex items-center justify-center gap-2 text-lg font-bold text-neutral-900">
          <ChefHat className="h-5 w-5 text-teal-600" /> {restaurantName}
        </div>
        {(invoiceAddress || invoicePhone || invoiceWebsite) && (
          <div className="mt-1 text-xs text-neutral-500">
            {invoiceAddress && <div>{invoiceAddress}</div>}
            {invoicePhone && <div>{invoicePhone}</div>}
            {invoiceWebsite && <div>{invoiceWebsite}</div>}
          </div>
        )}
      </div>

      <div className="mb-6 border-y border-dashed border-neutral-200 py-3 text-center text-sm text-neutral-500">
        Invoice #{order.orderNumber} · {formatOrderTimestamp(order.createdAt)}
        <br />
        {order.channel}
        {order.tableNumber ? ` · Table ${order.tableNumber}` : ""}
        {order.status === "Voided" && <div className="mt-1 font-semibold text-rose-600">Voided</div>}
      </div>

      {(order.customerName || order.customerPhone || order.customerAddress) && (
        <div className="mb-6 text-center text-sm text-neutral-600">
          {order.customerName && <div className="font-semibold">{order.customerName}</div>}
          {order.customerPhone && <div>{order.customerPhone}</div>}
          {order.customerAddress && <div>{order.customerAddress}</div>}
        </div>
      )}

      <div className="mb-4 overflow-hidden rounded-xl border border-neutral-200">
        {order.items.map((item, i) => (
          <div key={item.lineId ?? i} className="flex items-start justify-between border-t border-neutral-100 px-4 py-3 text-sm first:border-t-0">
            <div>
              <div className="font-medium text-neutral-800">
                {item.qty}x {item.name}
              </div>
              {item.note && <div className="text-xs italic text-neutral-400">↳ {item.note}</div>}
            </div>
            <div className="font-semibold text-neutral-800">{formatMoney(item.price * item.qty, currencySymbol)}</div>
          </div>
        ))}
      </div>

      <div className="mb-6 overflow-hidden rounded-xl border border-neutral-200">
        <Row label="Subtotal" value={subtotal} currencySymbol={currencySymbol} />
        {discount > 0 && <Row label={order.couponCode ? `Discount (${order.couponCode})` : "Discount"} value={-discount} currencySymbol={currencySymbol} />}
        <Row label="Tax" value={tax} currencySymbol={currencySymbol} />
        <Row label="Total" value={total} currencySymbol={currencySymbol} emphasize />
      </div>

      {paymentLines.length > 0 && (
        <div className="mb-6 overflow-hidden rounded-xl border border-neutral-200">
          {paymentLines.map((p, i) => (
            <Row key={i} label={`Paid — ${p.method}`} value={p.amount} currencySymbol={currencySymbol} />
          ))}
          {changeDue > 0 && <Row label="Change Due" value={changeDue} currencySymbol={currencySymbol} emphasize />}
        </div>
      )}

      <div className="mt-10 border-t border-neutral-200 pt-4 text-center text-xs text-neutral-400 whitespace-pre-wrap">
        {invoiceFooterText}
      </div>

      <style>{`
        @media print {
          @page { margin: 16mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}

function Row({
  label,
  value,
  currencySymbol,
  emphasize,
}: {
  label: string;
  value: number;
  currencySymbol: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between border-t border-neutral-100 px-4 py-3 text-sm first:border-t-0 ${
        emphasize ? "bg-neutral-50 font-bold text-neutral-900" : "text-neutral-600"
      }`}
    >
      <span>{label}</span>
      <span className={emphasize ? "" : "font-semibold text-neutral-800"}>{formatMoney(value, currencySymbol)}</span>
    </div>
  );
}
