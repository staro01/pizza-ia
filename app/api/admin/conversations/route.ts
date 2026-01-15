import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function extractMessages(messages: unknown): any[] {
  return Array.isArray(messages) ? (messages as any[]) : [];
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const take = Math.min(Number(searchParams.get("take") ?? 50), 200);
    const q = (searchParams.get("q") ?? "").trim();

    const conversations = await prisma.conversation.findMany({
      where: q
        ? {
            OR: [
              { externalId: { contains: q, mode: "insensitive" } },
              { id: { contains: q, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        externalId: true,
        createdAt: true,
        transcript: true,
        messages: true,
      },
    });

    // optionnel: renvoyer aussi lastMessage + count
    const normalized = conversations.map((c) => {
      const msgs = extractMessages(c.messages);
      const last = msgs.length ? msgs[msgs.length - 1] : null;

      return {
        ...c,
        messageCount: msgs.length,
        lastMessage: last,
      };
    });

    return NextResponse.json({ conversations: normalized });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
