import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    // petits filtres optionnels
    const take = Math.min(Number(searchParams.get("take") ?? 50), 200);
    const status = searchParams.get("status"); // "active" | "completed" | "cancelled" (optionnel)
    const q = (searchParams.get("q") ?? "").trim(); // recherche dans externalId (optionnel)

    const db: any = prisma;

    const where: any = {};
    if (status && ["active", "completed", "cancelled"].includes(status)) {
      where.status = status;
    }
    if (q) {
      where.OR = [
        { externalId: { contains: q, mode: "insensitive" } },
        // si tu veux plus tard : recherche dans messages etc.
      ];
    }

    const conversations = await db.conversation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1, // dernier message pour l'aperçu
        },
      },
    });

    return NextResponse.json({ conversations });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
