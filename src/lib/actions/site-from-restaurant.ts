"use server";

import { redirect } from "next/navigation";
import { requireRestaurantContext } from "@/lib/scope";
import { createRestaurantProject } from "@/lib/site/from-restaurant";

// "Build my website" on the admin Dashboard: creates (or finds) this business's website project, pre-filled from
// its own IQ POS record, and opens the studio. The studio link is private — the token is the only credential.
export async function buildMyWebsiteAction() {
  const { session, restaurantId } = await requireRestaurantContext();
  if (session.role !== "admin") throw new Error("Forbidden");
  const token = await createRestaurantProject(restaurantId, session.email);
  redirect(`/site/studio/${token}`);
}
