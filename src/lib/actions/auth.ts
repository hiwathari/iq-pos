"use server";

import { getKillState, isBlocked } from "@/lib/kill-switch";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { createSession, destroySession, getSession, rememberDeviceRestaurant, verifyPassword } from "@/lib/auth";
import { requireRestaurantContext } from "@/lib/scope";
import { headers } from "next/headers";
import { landingFor } from "@/lib/device";
import { SESSION_DURATION_SECONDS } from "@/lib/session";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prevState: LoginState | undefined, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") || "");
  // "Keep me signed in" (ticked by default): the usual 30 days. Unticked: this sign-in ends after 12 hours,
  // for a shared computer.
  const remember = formData.get("remember") === "on";

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

  const kill = await getKillState();
  if (isBlocked(kill, user)) {
    return {
      error: kill.global
        ? "The system is switched off right now. Only the platform owner can sign in."
        : "This business is switched off right now. Ask your manager or the platform owner to switch it back on.",
    };
  }

  await createSession(
    {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      restaurantId: user.restaurantId,
    },
    remember ? SESSION_DURATION_SECONDS : 60 * 60 * 12
  );
  // Deliberately does NOT call rememberDeviceRestaurant here — unlike a PIN login (see
  // pin-auth.ts), a password login happens on a personal laptop/dev machine as often as a
  // shared device, and "sticking" /login to the last-logged-into restaurant's branding for a
  // year on an arbitrary browser was surprising, not helpful (e.g. an admin or support person
  // logging into one restaurant's account briefly shouldn't change what every other visitor to
  // /login on that machine sees afterwards).

  // Phones (and the Till app) go straight into the Till; everyone else picks Till / Dashboard / Kitchen.
  redirect(landingFor(user.role, (await headers()).get("user-agent")));
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
