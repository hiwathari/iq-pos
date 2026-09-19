import { kitchenPinLoginAction } from "@/lib/actions/pin-auth";
import { PinLoginForm } from "@/components/pin-login-form";

export default function KitchenLoginPage() {
  return <PinLoginForm action={kitchenPinLoginAction} title="Kitchen Display" subtitle="Enter the kitchen access code" />;
}
