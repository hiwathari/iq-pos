"use server";

import { db } from "@/db/client";
import { ageChecks } from "@/db/schema";
import { requireRestaurantContext } from "@/lib/scope";

// A refused age-restricted sale, logged the moment staff tap "Refuse sale" on the Till (approved
// ones are logged with the order — see placeOrderAction). docs/retail-plan step 3.5.
export async function logAgeRefusalAction(input: { dishId: string; productName: string; minAge: number }) {
  const { session, restaurantId } = await requireRestaurantContext();
  const minAge = [16, 18, 21, 25].includes(Number(input?.minAge)) ? Number(input.minAge) : 18;
  await db.insert(ageChecks).values({
    restaurantId,
    dishId: typeof input?.dishId === "string" ? input.dishId : null,
    productName: String(input?.productName ?? "").slice(0, 120) || "Product",
    minAge,
    result: "refused",
    staffName: session.name,
  });
}
