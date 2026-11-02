"use server";

import { requireRestaurantContext } from "@/lib/scope";
import { canonicalCode } from "@/lib/barcode";
import { findStoreCredit, isCreditCode } from "@/lib/data/store-credit";

// A scanned / typed store-credit slip on the Till: is it real, and how much is on it.
export async function lookupStoreCreditAction(raw: string): Promise<{ code?: string; balance?: number; customerName?: string | null; error?: string }> {
  const { restaurantId } = await requireRestaurantContext();
  const code = canonicalCode(String(raw ?? "").trim());
  if (!isCreditCode(code)) return { error: "That isn't a store-credit code." };
  const credit = await findStoreCredit(restaurantId, code);
  if (!credit) return { error: "That store credit isn't recognised." };
  if (credit.expiresAt && credit.expiresAt < Date.now()) return { error: "That store credit has expired." };
  if (credit.balance <= 0.004) return { error: "That store credit has been used up." };
  return { code: credit.code, balance: credit.balance, customerName: credit.customerName };
}
