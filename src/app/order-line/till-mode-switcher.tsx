"use client";

import { useEffect, useState } from "react";
import { OrderLineClient } from "./order-line-client";
import { MobileTillClient } from "./mobile-till-client";
import type { Category, Dish, Order, OrderChannel, PaymentTerminal, RestaurantTable } from "@/lib/types";
import type { EmbeddedFormat } from "@/lib/barcode";
import type { PromotionDef } from "@/lib/promotions";
import type { KitchenPrinter } from "@/lib/kitchen-ticket";
import type { Printer } from "@/lib/types";
import type { VariantLite } from "@/lib/variants";

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
  taxEnabled,
  invoiceAddress,
  invoicePhone,
  invoiceEmail,
  invoiceWebsite,
  invoiceLogoUrl,
  invoiceFooterText,
  returnsPolicy,
  openTime,
  timezone,
  localPrintTarget,
  staffName,
  hasKitchen,
  channels,
  showTables,
  barcodesByDish,
  embeddedFormats,
  stockByDish,
  stockMode,
  canOverridePrice,
  canAddProducts,
  canRefund,
  promotions = [],
  lastEndDayAt = null,
  floors = ["Ground Floor"],
  kitchenPrinters = [],
  printerList,
  variantsByDish = {},
  tradeAccounts = [],
}: {
  categories: Category[];
  dishes: Dish[];
  tables: RestaurantTable[];
  orders: Order[];
  paymentTerminals: PaymentTerminal[];
  currencySymbol: string;
  restaurantName: string;
  canDiscount: boolean;
  taxEnabled: boolean;
  invoiceAddress?: string;
  invoicePhone?: string;
  invoiceEmail?: string;
  invoiceWebsite?: string;
  invoiceLogoUrl?: string;
  invoiceFooterText: string;
  returnsPolicy?: string;
  openTime: string | null;
  timezone: string;
  // The restaurant's default printer, when set up for local network printing (see
  // docs/DEVELOPER_GUIDE.md §7.8) — only the full desktop Till acts on it (see MobileTillClient
  // below, which has no print button at all today).
  localPrintTarget: { ip: string; port: number | null } | null;
  staffName?: string;
  // Whether this restaurant has a Kitchen Display or a kitchen ticket printer (see hasKitchen in
  // lib/types.ts) — without one, the Till says "Place Order" instead of "Send to Kitchen".
  hasKitchen: boolean;
  // From the business type (lib/business-profile.ts): which order types the Till offers (first =
  // default) and whether tables/guests exist at all — shops have neither tables nor Dine in.
  channels: OrderChannel[];
  showTables: boolean;
  // Retail selling (docs/retail-plan Phase 3): barcode lookup, scale-label formats, stock on tiles.
  barcodesByDish: Record<string, { code: string; packQty: number }[]>;
  embeddedFormats: EmbeddedFormat[];
  stockByDish: Record<string, { qty: number; low: number; unit: string }>;
  stockMode: "allow" | "warn" | "block";
  canOverridePrice: boolean;
  canAddProducts: boolean;
  canRefund: boolean;
  promotions?: PromotionDef[];
  // When the last End Day happened — finished orders from before it live in History, not Tickets.
  lastEndDayAt?: number | null;
  // The restaurant's floors (Manage Table), in order.
  floors?: string[];
  kitchenPrinters?: KitchenPrinter[];
  // All printers, only for logins allowed to set printers up (Settings permission).
  printerList?: Printer[];
  variantsByDish?: Record<string, VariantLite[]>;
  tradeAccounts?: { id: string; companyName: string; priceTier: string | null; onHold: boolean; creditLimit: number | null; balance: number }[];
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

  function switchToSimple() {
    setMode("simple");
    try {
      localStorage.setItem(MODE_KEY, "simple");
    } catch {
      // Ignore — the switch still applies for this session even if it can't be remembered.
    }
  }

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
        taxEnabled={taxEnabled}
        onSwitchToFull={switchToFull}
        hasKitchen={hasKitchen}
        channels={channels}
        barcodesByDish={barcodesByDish}
        embeddedFormats={embeddedFormats}
        promotions={promotions}
      floors={floors}
        variantsByDish={variantsByDish}
      />
    );
  }

  return (
    <OrderLineClient
      onSwitchToMobile={switchToSimple}
      categories={categories}
      dishes={dishes}
      tables={tables}
      orders={orders}
      paymentTerminals={paymentTerminals}
      currencySymbol={currencySymbol}
      restaurantName={restaurantName}
      canDiscount={canDiscount}
      taxEnabled={taxEnabled}
      invoiceAddress={invoiceAddress}
      invoicePhone={invoicePhone}
      invoiceEmail={invoiceEmail}
      invoiceWebsite={invoiceWebsite}
      invoiceLogoUrl={invoiceLogoUrl}
      invoiceFooterText={invoiceFooterText}
      returnsPolicy={returnsPolicy}
      openTime={openTime}
      timezone={timezone}
      localPrintTarget={localPrintTarget}
      staffName={staffName}
      hasKitchen={hasKitchen}
      channels={channels}
      showTables={showTables}
      barcodesByDish={barcodesByDish}
      embeddedFormats={embeddedFormats}
      stockByDish={stockByDish}
      stockMode={stockMode}
      canOverridePrice={canOverridePrice}
      canAddProducts={canAddProducts}
      canRefund={canRefund}
      promotions={promotions}
      floors={floors}
      lastEndDayAt={lastEndDayAt}
      kitchenPrinters={kitchenPrinters}
      printerList={printerList}
      variantsByDish={variantsByDish}
      tradeAccounts={tradeAccounts}
    />
  );
}
