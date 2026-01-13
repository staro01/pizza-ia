import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ConversationStatus } from "@prisma/client";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const q = (searchParams.get("q") ?? "").trim(); // recherche externalId
  const status = (searchParams.get("status") ?? "").trim(); // active|completed|cancelled|all
  const take = Math.min(Number(searchParams.get("take") ?? "50"), 200);

  const where: any = {};

  if (q) {
    where.OR = [
      { externalId: { contains: q } },
      // si tu ajoutes plus tard customerName/tel dans conversation, tu pourras chercher dessus ici
    ];
  }

  if (status && status !== "all") {
    // sécurité : n'accepte que les 3 valeurs enum
    if (
      status === ConversationStatus.active ||
      status === ConversationStatus.completed ||
      status === ConversationStatus.cancelled
    ) {
      where.status = status;
    }
  }

  const conversations = await prisma.conversation.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      externalId: true,
      createdAt: true,
      status: true,
      failCount: true,
      cancelledAt: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { content: true, createdAt: true, role: true },
      },
      _count: { select: { messages: true } },
    },
  });

  return NextResponse.json({ conversations });
}
