"use client";

import { useEffect, useState } from "react";
import { OrderLineClient } from "./order-line-client";
import { MobileTillClient } from "./mobile-till-client";
import type { Category, Dish, Order, PaymentTerminal, RestaurantTable } from "@/lib/types";

// A handheld runner's phone/mobile POS gets the simplified order-only Till; a counter tablet
// or desktop gets the full one. Auto-detected from screen width on first load. Going back to
// Full from Simple is offered in Simple Mode itself; the reverse isn't needed since a wide
// screen already auto-detects Full, so the full desktop Till is left completely untouched.
const MODE_KEY = "till-mode-override";
const MOBILE_BREAKPOINT = 700;

type Mode = "full" | "simple";

export function TillModeSwitcher({
  categories,
  dishes,
  tables,
  orders,
  paymentTerminals,
  currencySymbol,
  restaurantName,
  canDiscount,
  invoiceAddress,
  invoicePhone,
  invoiceWebsite,
  invoiceLogoUrl,
  invoiceFooterText,
}: {
  categories: Category[];
  dishes: Dish[];
  tables: RestaurantTable[];
  orders: Order[];
  paymentTerminals: PaymentTerminal[];
  currencySymbol: string;
  restaurantName: string;
  canDiscount: boolean;
  invoiceAddress?: string;
  invoicePhone?: string;
  invoiceWebsite?: string;
  invoiceLogoUrl?: string;
  invoiceFooterText: string;
}) {
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    let resolved: Mode;
    try {
      const override = localStorage.getItem(MODE_KEY);
      resolved = override === "full" || override === "simple" ? override : window.innerWidth < MOBILE_BREAKPOINT ? "simple" : "full";
    } catch {
      // Storage unavailable — fall back to auto-detecting from screen size.
      resolved = window.innerWidth < MOBILE_BREAKPOINT ? "simple" : "full";
    }
    // Deferred a tick so this doesn't set state synchronously within the effect body.
    setTimeout(() => setMode(resolved), 0);
  }, []);

  function switchToFull() {
    setMode("full");
    try {
      localStorage.setItem(MODE_KEY, "full");
    } catch {
      // Ignore — the switch still applies for this session even if it can't be remembered.
    }
  }

  if (mode === null) {
    return <div className="flex h-full items-center justify-center bg-neutral-50" />;
  }

  if (mode === "simple") {
    return (
      <MobileTillClient
        categories={categories}
        dishes={dishes}
        tables={tables}
        orders={orders}
        currencySymbol={currencySymbol}
        restaurantName={restaurantName}
        onSwitchToFull={switchToFull}
      />
    );
  }

  return (
    <OrderLineClient
      categories={categories}
      dishes={dishes}
      tables={tables}
      orders={orders}
      paymentTerminals={paymentTerminals}
      currencySymbol={currencySymbol}
      restaurantName={restaurantName}
      canDiscount={canDiscount}
      invoiceAddress={invoiceAddress}
      invoicePhone={invoicePhone}
      invoiceWebsite={invoiceWebsite}
      invoiceLogoUrl={invoiceLogoUrl}
      invoiceFooterText={invoiceFooterText}
    />
  );
}
