import { tillPinLoginAction } from "@/lib/actions/pin-auth";
import { PinLoginForm } from "@/components/pin-login-form";

export default function TillLoginPage() {
  return <PinLoginForm action={tillPinLoginAction} title="Till Access" subtitle="Enter your 6-digit staff code" />;
}
