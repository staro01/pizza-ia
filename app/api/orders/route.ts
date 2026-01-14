import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";

export async function GET() {
  try {
    const { userId, sessionClaims } = await auth();

    if (!userId) {
      return NextResponse.json({ orders: [] }, { status: 200 });
    }

    const role = (sessionClaims?.publicMetadata as any)?.role;

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
      where: { clerkUserId: userId },
      select: { id: true },
    });

    if (!restaurant) {
      // pas encore relié : on renvoie vide (pas d'erreur)
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
