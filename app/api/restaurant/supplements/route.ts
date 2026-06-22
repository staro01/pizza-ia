import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "../../../lib/prisma";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

async function getRestaurant() {
  const user = await currentUser();
  if (!user) return null;
  return prisma.restaurant.findFirst({ where: { clerkUserId: user.id } });
}

export async function GET() {
  const restaurant = await getRestaurant();
  if (!restaurant) return Response.json([], { status: 200 });
  const items = await prisma.supplement.findMany({ where: { restaurantId: restaurant.id }, orderBy: { name: "asc" } });
  return Response.json(items);
}

export async function POST(req: NextRequest) {
  const restaurant = await getRestaurant();
  if (!restaurant) return Response.json({ error: "Non autorisé" }, { status: 401 });
  const body = await req.json();
  const item = await prisma.supplement.create({
    data: { restaurantId: restaurant.id, name: body.name, price: body.price ?? 0, available: body.available ?? true },
  });
  return Response.json(item);
}
