import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "../../../lib/prisma";

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const role = String((user.publicMetadata as any)?.role ?? "").toUpperCase();
    if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const restaurants = await prisma.restaurant.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, clerkUserId: true, createdAt: true },
      take: 200,
    });

    return NextResponse.json({ restaurants }, { status: 200 });
  } catch (err: any) {
    console.error("GET /api/admin/restaurants error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
