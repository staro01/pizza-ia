// app/lib/restaurant-bootstrap.ts
import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "./prisma";

function getRole(user: any): string | null {
  const role = user?.publicMetadata?.role;
  return typeof role === "string" ? role.toUpperCase() : null;
}

/**
 * Crée (si besoin) le Restaurant lié au Clerk user.
 * Optionnel : rattache les commandes orphelines (restaurantId NULL) à ce restaurant
 * si BOOTSTRAP_ATTACH_ORPHAN_ORDERS=true
 */
export async function ensureRestaurantForCurrentUser() {
  const user = await currentUser();
  if (!user) return null;

  const role = getRole(user);
  if (role !== "RESTAURANT") return null;

  const email = user.emailAddresses?.[0]?.emailAddress ?? null;

  const restaurant = await prisma.restaurant.upsert({
    where: { clerkUserId: user.id },
    update: {},
    create: {
      clerkUserId: user.id,
      name: email ? `Restaurant ${email}` : `Restaurant ${user.id.slice(0, 6)}`,
    },
  });

  if (process.env.BOOTSTRAP_ATTACH_ORPHAN_ORDERS === "true") {
    await prisma.order.updateMany({
      where: { restaurantId: null },
      data: { restaurantId: restaurant.id },
    });
  }

  return restaurant;
}
