import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "../../../lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const role = String((user.publicMetadata as any)?.role ?? "").toUpperCase();
    if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId.trim() : "";
    if (!restaurantId) {
      return NextResponse.json({ error: "Missing restaurantId" }, { status: 400 });
    }

    // sécurité: check que le resto existe
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true },
    });
    if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

    // rattache toutes les commandes orphelines
    const updated = await prisma.order.updateMany({
      where: { restaurantId: null },
      data: { restaurantId },
    });

    return NextResponse.json(
      { ok: true, attachedCount: updated.count, restaurantId },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("POST /api/admin/attach-orphan-orders error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
