"use client";

import { useEffect, useState } from "react";
import { OrderLineClient, type ShiftControls } from "./order-line-client";
import { MobileTillClient } from "./mobile-till-client";
import type { Category, Dish, Order, OrderChannel, PaymentTerminal, RestaurantTable } from "@/lib/types";
import type { EmbeddedFormat } from "@/lib/barcode";
import type { PromotionDef } from "@/lib/promotions";
import type { KitchenPrinter } from "@/lib/kitchen-ticket";
import type { Printer } from "@/lib/types";
import type { VariantLite } from "@/lib/variants";

// The Till opens in the simple (mobile) Till on every device — phone, tablet or computer. "Full Till"
// (offered in the simple Till) switches to the full one for as long as that browser tab / app session
// lasts (sessionStorage), so the next time the Till is opened it starts simple again. The full Till has a
// "Mobile till" button to go back. (Before 2026-11-13 the choice was remembered for good and wide screens
// started in the full Till; the old saved value is cleared.)
const MODE_KEY = "till-mode-override";

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
  invoiceQrEnabled = true,
  todaySales,
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
  shiftControls,
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
  invoiceQrEnabled?: boolean;
  // Today's cash and card takings (shown in the full Till's Day sales box).
  todaySales?: { cash: number; card: number };
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
  // Open Till / End Day on the full Till (not the mobile Till); left out when this login may not end the day.
  shiftControls?: ShiftControls;
  kitchenPrinters?: KitchenPrinter[];
  // All printers, only for logins allowed to set printers up (Settings permission).
  printerList?: Printer[];
  variantsByDish?: Record<string, VariantLite[]>;
  tradeAccounts?: { id: string; companyName: string; priceTier: string | null; onHold: boolean; creditLimit: number | null; balance: number }[];
}) {
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    let resolved: Mode = "simple";
    try {
      localStorage.removeItem(MODE_KEY);
      if (sessionStorage.getItem(MODE_KEY) === "full") resolved = "full";
    } catch {
      // Storage unavailable — start in the simple Till.
    }
    // Deferred a tick so this doesn't set state synchronously within the effect body.
    setTimeout(() => setMode(resolved), 0);
  }, []);

  function switchToSimple() {
    setMode("simple");
    try {
      sessionStorage.removeItem(MODE_KEY);
    } catch {
      // Ignore — the switch still applies even if it can't be remembered.
    }
  }

  function switchToFull() {
    setMode("full");
    try {
      sessionStorage.setItem(MODE_KEY, "full");
    } catch {
      // Ignore — the switch still applies for now even if it can't be remembered.
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
      invoiceQrEnabled={invoiceQrEnabled}
      todaySales={todaySales}
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
      shiftControls={shiftControls}
      lastEndDayAt={lastEndDayAt}
      kitchenPrinters={kitchenPrinters}
      printerList={printerList}
      variantsByDish={variantsByDish}
      tradeAccounts={tradeAccounts}
    />
  );
}
