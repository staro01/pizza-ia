import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "../../../../lib/prisma";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

async function getRestaurant() {
  const user = await currentUser();
  if (!user) return null;
  return prisma.restaurant.findFirst({ where: { clerkUserId: user.id } });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const restaurant = await getRestaurant();
  if (!restaurant) return Response.json({ error: "Non autorisé" }, { status: 401 });
  const body = await req.json();
  const item = await prisma.menuItem.update({ where: { id: params.id }, data: body });
  return Response.json(item);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const restaurant = await getRestaurant();
  if (!restaurant) return Response.json({ error: "Non autorisé" }, { status: 401 });
  await prisma.menuItem.delete({ where: { id: params.id } });
  return Response.json({ ok: true });
}
