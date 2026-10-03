"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { printers, restaurants, users } from "@/db/schema";
import { createSession, rememberDeviceRestaurant } from "@/lib/auth";

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
  await rememberDeviceRestaurant(staff.restaurantId);

  redirect("/order-line");
}

export async function kitchenPinLoginAction(
  _prevState: PinLoginState | undefined,
  formData: FormData
): Promise<PinLoginState> {
  const pin = readPin(formData);
  if (!pin) return { error: "Enter the 6-digit code." };

  const [staff] = await db.select().from(users).where(eq(users.kitchenPin, pin)).limit(1);
  if (staff) {
    if (!staff.active || !staff.restaurantId) return { error: "Incorrect code." };
    const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, staff.restaurantId)).limit(1);
    if (!restaurant || !restaurant.active) return { error: "Incorrect code." };

    await createSession(
      {
        userId: staff.id,
        email: staff.email,
        name: staff.name,
        role: "kitchen_display",
        restaurantId: staff.restaurantId,
      },
      DEVICE_SESSION_SECONDS
    );
    await rememberDeviceRestaurant(staff.restaurantId);
    redirect("/kitchen");
  }

  // Not a staff member's personal kitchen PIN — try a dedicated display's own PIN instead (see
  // printers.pin). Unlike a staff login, this defaults the screen straight to that display's own
  // station rather than the station-less "All" view.
  const [display] = await db.select().from(printers).where(eq(printers.pin, pin)).limit(1);
  if (!display || !display.active) return { error: "Incorrect code." };

  const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, display.restaurantId)).limit(1);
  if (!restaurant || !restaurant.active) return { error: "Incorrect code." };

  await createSession(
    {
      userId: display.id,
      email: "",
      name: display.name,
      role: "kitchen_display",
      restaurantId: display.restaurantId,
      displayStation: display.station,
    },
    DEVICE_SESSION_SECONDS
  );
  await rememberDeviceRestaurant(display.restaurantId);
  redirect("/kitchen");
}

// Lets a staff member sign into their own full dashboard — same permissions as their normal
// email/password login — with the same PIN that unlocks the Till and Kitchen Display for them,
// so there's only ever one code to remember. Regular session length (not the shared-device
// duration above), since this is signing into a personal account, not unlocking shared hardware.
export async function staffPinLoginAction(
  _prevState: PinLoginState | undefined,
  formData: FormData
): Promise<PinLoginState> {
  const pin = readPin(formData);
  if (!pin) return { error: "Enter the 6-digit code." };

  const [staff] = await db.select().from(users).where(eq(users.tillPin, pin)).limit(1);
  if (!staff || !staff.active || !staff.restaurantId) return { error: "Incorrect code." };

  const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, staff.restaurantId)).limit(1);
  if (!restaurant || !restaurant.active) return { error: "Incorrect code." };

  await createSession({
    userId: staff.id,
    email: staff.email,
    name: staff.name,
    role: staff.role,
    restaurantId: staff.restaurantId,
  });
  await rememberDeviceRestaurant(staff.restaurantId);

  redirect("/dashboard");
}
