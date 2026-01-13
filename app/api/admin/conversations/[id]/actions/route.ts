import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ConversationStatus } from "@prisma/client";

export async function POST(req: Request, context: any) {
  const id = context?.params?.id as string;

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as
    | { type: "setStatus"; status: ConversationStatus }
    | { type: "resetFail" }
    | null;

  if (!body) {
    return NextResponse.json({ error: "Body JSON invalide" }, { status: 400 });
  }

  const existing = await prisma.conversation.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 });
  }

  if (body.type === "resetFail") {
    const updated = await prisma.conversation.update({
      where: { id },
      data: { failCount: 0 },
    });
    return NextResponse.json({ ok: true, conversation: updated });
  }

  if (body.type === "setStatus") {
    const updated = await prisma.conversation.update({
      where: { id },
      data: {
        status: body.status,
        cancelledAt: body.status === ConversationStatus.cancelled ? new Date() : null,
      },
    });
    return NextResponse.json({ ok: true, conversation: updated });
  }

  return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
}
