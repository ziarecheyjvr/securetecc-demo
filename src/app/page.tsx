import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth";

export default async function Home() {
  const appUser = await getCurrentAppUser();
  redirect(appUser ? "/dashboard" : "/login");
}
