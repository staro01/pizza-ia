import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "../../../lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const roleRaw = (sessionClaims?.publicMetadata as any)?.role;
  const role = typeof roleRaw === "string" ? roleRaw.toUpperCase() : null;

  if (role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const clerkUserId = String(body?.clerkUserId ?? "").trim();
  const attachOrphanOrders = Boolean(body?.attachOrphanOrders);

  if (!name || !clerkUserId) {
    return NextResponse.json(
      { error: "Missing name or clerkUserId" },
      { status: 400 }
    );
  }

  const restaurant = await prisma.restaurant.upsert({
    where: { clerkUserId },
    update: { name },
    create: { name, clerkUserId },
  });

  let attachedCount = 0;
  if (attachOrphanOrders) {
    const res = await prisma.order.updateMany({
      where: { restaurantId: null },
      data: { restaurantId: restaurant.id },
    });
    attachedCount = res.count;
  }

  return NextResponse.json({ restaurant, attachedCount });
}
