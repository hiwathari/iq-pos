import { AppShell } from "@/components/app-shell";
import { getActiveRestaurantId, getSession } from "@/lib/auth";
import { getRestaurant } from "@/lib/data/restaurants";
import { businessProfile } from "@/lib/business-profile";
import { FAQ, faqForFeatures } from "./faq";
import { HelpCenterClient } from "./help-center-client";

// Hides answers for features this business has switched off (tables, kitchen…); with no
// restaurant in context (e.g. Super Admin) everything shows.
export default async function HelpCenterPage() {
  const session = await getSession();
  const restaurantId = session ? await getActiveRestaurantId(session) : null;
  const restaurant = restaurantId ? await getRestaurant(restaurantId) : null;
  const sections = restaurant
    ? faqForFeatures(FAQ, (key) => businessProfile(restaurant.businessType, restaurant.features).features[key])
    : FAQ;
  return (
    <AppShell title="Help Center">
      <HelpCenterClient sections={sections} />
    </AppShell>
  );
}
