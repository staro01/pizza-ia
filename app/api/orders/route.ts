import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "../../lib/prisma";

export async function GET() {
  try {
    const user = await currentUser();

    if (!user) {
      return NextResponse.json({ orders: [] }, { status: 200 });
    }

    const role = String((user.publicMetadata as any)?.role ?? "").toUpperCase();

    // ADMIN : voit tout
    if (role === "ADMIN") {
      const orders = await prisma.order.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      return NextResponse.json({ orders }, { status: 200 });
    }

    // RESTAURANT : on trouve son resto via clerkUserId
    const restaurant = await prisma.restaurant.findUnique({
      where: { clerkUserId: user.id },
      select: { id: true },
    });

    if (!restaurant) {
      return NextResponse.json({ orders: [] }, { status: 200 });
    }

    const orders = await prisma.order.findMany({
      where: { restaurantId: restaurant.id },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json({ orders }, { status: 200 });
  } catch (err: any) {
    console.error("GET /api/orders error:", err);
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}
