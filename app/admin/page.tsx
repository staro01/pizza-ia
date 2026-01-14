export const dynamic = "force-dynamic";

import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

function getRole(user: any): string | null {
  const role = user?.publicMetadata?.role;
  return typeof role === "string" ? role.toUpperCase() : null;
}

export default async function AdminIndexPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const role = getRole(user);
  if (role !== "ADMIN") redirect("/restaurant");

  redirect("/admin/conversations");
}
