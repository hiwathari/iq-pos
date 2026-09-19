"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { restaurants, users } from "@/db/schema";
import { createSession } from "@/lib/auth";

// PIN-unlocked devices (till, kitchen display) get a shorter session than a full staff login,
// since they're shared hardware left logged in for a shift rather than a personal device.
const DEVICE_SESSION_SECONDS = 60 * 60 * 16;

export interface PinLoginState {
  error?: string;
}

function readPin(formData: FormData): string | null {
  const pin = String(formData.get("pin") || "").trim();
  return /^\d{6}$/.test(pin) ? pin : null;
}

export async function tillPinLoginAction(
  _prevState: PinLoginState | undefined,
  formData: FormData
): Promise<PinLoginState> {
  const pin = readPin(formData);
  if (!pin) return { error: "Enter the 6-digit code." };

  const [staff] = await db.select().from(users).where(eq(users.tillPin, pin)).limit(1);
  if (!staff || !staff.active || !staff.restaurantId) return { error: "Incorrect code." };

  const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, staff.restaurantId)).limit(1);
  if (!restaurant || !restaurant.active) return { error: "Incorrect code." };

  await createSession(
    {
      userId: staff.id,
      email: staff.email,
      name: staff.name,
      role: "till",
      restaurantId: staff.restaurantId,
    },
    DEVICE_SESSION_SECONDS
  );

  redirect("/order-line");
}

export async function kitchenPinLoginAction(
  _prevState: PinLoginState | undefined,
  formData: FormData
): Promise<PinLoginState> {
  const pin = readPin(formData);
  if (!pin) return { error: "Enter the 6-digit code." };

  const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.kitchenPin, pin)).limit(1);
  if (!restaurant || !restaurant.active) return { error: "Incorrect code." };

  await createSession(
    {
      userId: `kitchen:${restaurant.id}`,
      email: "",
      name: "Kitchen Display",
      role: "kitchen_display",
      restaurantId: restaurant.id,
    },
    DEVICE_SESSION_SECONDS
  );

  redirect("/kitchen");
}
