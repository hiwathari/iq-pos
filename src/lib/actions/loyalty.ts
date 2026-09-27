"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { loyaltyMembers } from "@/db/schema";
import { requireRestaurantContext } from "@/lib/scope";
import { findLoyaltyMemberByCode, findLoyaltyMemberByContact } from "@/lib/data/loyalty";
import { getRestaurant } from "@/lib/data/restaurants";
import { generateLoyaltyCode } from "@/lib/loyalty-code";
import type { LoyaltyMember } from "@/lib/types";

export interface LoyaltyLookupState {
  error?: string;
  member?: LoyaltyMember;
  created?: boolean;
}

function normalizeContact(contactType: "phone" | "email", value: string) {
  const trimmed = value.trim();
  return contactType === "email" ? trimmed.toLowerCase() : trimmed;
}

async function insertNewMember(input: {
  restaurantId: string;
  contactType: "phone" | "email";
  contactValue: string;
  name?: string;
  restaurantName: string;
}) {
  // Retries a handful of times on a code collision — the random 5-character suffix space is
  // large enough that a clash is rare, but the card code is globally unique so it must be checked.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateLoyaltyCode(input.restaurantName);
    try {
      const [created] = await db
        .insert(loyaltyMembers)
        .values({
          restaurantId: input.restaurantId,
          contactType: input.contactType,
          contactValue: input.contactValue,
          name: input.name || null,
          code,
        })
        .returning();
      return created;
    } catch (err) {
      if (attempt === 4) throw err;
    }
  }
  throw new Error("Could not generate a unique loyalty code.");
}

// Called from the Till: looks a customer up by phone/email, enrolling them with a freshly
// generated loyalty code the first time they're seen, so a repeat visit always finds the same
// card instead of creating a duplicate.
export async function lookupOrCreateLoyaltyMemberAction(input: {
  contactType: "phone" | "email";
  contactValue: string;
  name?: string;
}): Promise<LoyaltyLookupState> {
  const { restaurantId } = await requireRestaurantContext();
  const contactValue = normalizeContact(input.contactType, input.contactValue);
  if (!contactValue) return { error: "Enter a phone number or email." };

  const existing = await findLoyaltyMemberByContact(restaurantId, contactValue);
  if (existing) return { member: existing, created: false };

  const restaurant = await getRestaurant(restaurantId);
  const created = await insertNewMember({
    restaurantId,
    contactType: input.contactType,
    contactValue,
    name: input.name,
    restaurantName: restaurant?.name ?? "IQ",
  });
  revalidatePath("/loyalty");
  return { member: created, created: true };
}

export async function lookupLoyaltyMemberByCodeAction(code: string): Promise<LoyaltyLookupState> {
  const { restaurantId } = await requireRestaurantContext();
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return { error: "Enter a loyalty code." };
  const member = await findLoyaltyMemberByCode(restaurantId, trimmed);
  if (!member) return { error: "No loyalty member found with that code." };
  return { member };
}
