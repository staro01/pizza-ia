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
  if (!restaurant) return Response.json(null, { status: 404 });
  return Response.json(restaurant);
}

export async function PATCH(req: NextRequest) {
  const restaurant = await getRestaurant();
  if (!restaurant) return Response.json({ error: "Non autorisé" }, { status: 401 });
  const body = await req.json();
  const updated = await prisma.restaurant.update({
    where: { id: restaurant.id },
    data: { name: body.name, phone: body.phone, address: body.address, estimatedPrepTime: body.estimatedPrepTime, deliveryEnabled: body.deliveryEnabled, deliveryFee: body.deliveryFee, deliveryMinimum: body.deliveryMinimum, paymentMethods: body.paymentMethods, vacationMode: body.vacationMode, vacationMessage: body.vacationMessage, allergensInfo: body.allergensInfo, currentPromos: body.currentPromos, welcomeMessage: body.welcomeMessage, openingHours: body.openingHours },
  });
  return Response.json(updated);
}
