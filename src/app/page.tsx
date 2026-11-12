import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth";
import { landingFor } from "@/lib/device";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  redirect(landingFor(session.role, (await headers()).get("user-agent")));
}
