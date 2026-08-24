"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { createSession, destroySession, verifyPassword } from "@/lib/auth";

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

  redirect(user.role === "super_admin" ? "/super-admin" : "/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
