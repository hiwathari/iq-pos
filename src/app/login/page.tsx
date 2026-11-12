import { BrandLogo } from "@/components/brand-logo";
import { getRememberedDeviceRestaurantId } from "@/lib/auth";
import { getRestaurant } from "@/lib/data/restaurants";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const restaurantId = await getRememberedDeviceRestaurantId();
  const restaurant = restaurantId ? await getRestaurant(restaurantId) : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <BrandLogo name={restaurant?.name} logoUrl={restaurant?.invoiceLogoUrl} />
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-7 shadow-sm">
          <h1 className="mb-1 text-lg font-semibold text-neutral-900">Sign in</h1>
          <p className="mb-6 text-sm text-neutral-500">Enter your username and password.</p>
          <LoginForm />
        </div>

      </div>
    </div>
  );
}
