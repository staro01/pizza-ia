import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ✅ API simple : liste des commandes (pas de création ici)
export async function GET() {
  const db: any = prisma;

  const orders = await db.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { items: true },
  });

  return NextResponse.json({ orders });
}
