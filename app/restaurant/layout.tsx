import { ensureRestaurantForCurrentUser } from "@/lib/restaurant-bootstrap";

export default async function RestaurantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await ensureRestaurantForCurrentUser();
  return <>{children}</>;
}
