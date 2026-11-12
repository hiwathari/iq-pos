"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { createSession, destroySession, getSession, rememberDeviceRestaurant, verifyPassword } from "@/lib/auth";
import { requireRestaurantContext } from "@/lib/scope";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prevState: LoginState | undefined, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !user.active) {
    return { error: "Invalid email or password." };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { error: "Invalid email or password." };
  }

  await createSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    restaurantId: user.restaurantId,
  });
  // Deliberately does NOT call rememberDeviceRestaurant here — unlike a PIN login (see
  // pin-auth.ts), a password login happens on a personal laptop/dev machine as often as a
  // shared device, and "sticking" /login to the last-logged-into restaurant's branding for a
  // year on an arbitrary browser was surprising, not helpful (e.g. an admin or support person
  // logging into one restaurant's account briefly shouldn't change what every other visitor to
  // /login on that machine sees afterwards).

  redirect(user.role === "super_admin" || user.role === "regional_admin" ? "/super-admin" : "/dashboard");
}

export async function logoutAction() {
  const session = await getSession();
  await destroySession();
  if (session?.role === "till") redirect("/till-login");
  if (session?.role === "kitchen_display") redirect("/kitchen-login");
  redirect("/login");
}

// From the admin's Dashboard: turns the device you are on into a PIN-login screen for the Till or the
// Kitchen Display. The restaurant is remembered on the device (so the PIN screen shows its name and
// logo, and a staff PIN finds the right restaurant) and the admin's password session is closed, so
// staff only ever see the PIN pad. Admin only.
export async function startDeviceLoginAction(kind: "till" | "kitchen") {
  const { session, restaurantId } = await requireRestaurantContext();
  if (session.role !== "admin") return;
  await rememberDeviceRestaurant(restaurantId);
  await destroySession();
  redirect(kind === "till" ? "/till-login" : "/kitchen-login");
}
