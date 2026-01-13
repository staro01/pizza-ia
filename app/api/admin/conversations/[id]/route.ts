import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, context: any) {
  const id = context?.params?.id as string;

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  if (!conversation) {
    return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, conversation });
}
