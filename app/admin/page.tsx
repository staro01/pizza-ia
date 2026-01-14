import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

function getRole(user: any): string | null {
  const role = user?.publicMetadata?.role;
  return typeof role === "string" ? role.toUpperCase() : null;
}

export default async function AdminIndexPage() {
  const user = await currentUser();

  // Si pas connecté, Clerk middleware te redirige souvent déjà,
  // mais on reste safe ici.
  if (!user) redirect("/sign-in");

  const role = getRole(user);

  // Protection simple : seuls les ADMIN accèdent à /admin
  if (role !== "ADMIN") redirect("/restaurant");

  // Ton "home" admin peut être un redirect, ou une vraie page.
  redirect("/admin/conversations");
}
