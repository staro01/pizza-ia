import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ensureRestaurantForCurrentUser } from "../lib/restaurant-bootstrap";

export const dynamic = "force-dynamic";

export default async function RestaurantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const role = String((user.publicMetadata as any)?.role ?? "").toUpperCase();

  // ✅ ADMIN et RESTAURANT peuvent accéder à /restaurant
  if (role !== "RESTAURANT" && role !== "ADMIN") redirect("/");

  // ✅ bootstrap seulement pour RESTAURANT
  if (role === "RESTAURANT") {
    await ensureRestaurantForCurrentUser();
  }

  return <>{children}</>;
}
