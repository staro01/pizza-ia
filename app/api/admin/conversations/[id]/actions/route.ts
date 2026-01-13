import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type ConversationStatusType = "active" | "completed" | "cancelled";

export async function POST(req: Request, context: any) {
  try {
    const id = context?.params?.id as string;
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({} as any));
    const action = String(body?.action ?? "");
    const status = String(body?.status ?? "") as ConversationStatusType;

    const db: any = prisma;

    // Actions simples (tu peux adapter selon ton usage)
    if (action === "setStatus") {
      if (!["active", "completed", "cancelled"].includes(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }

      const updated = await db.conversation.update({
        where: { id },
        data: {
          status,
          cancelledAt: status === "cancelled" ? new Date() : null,
        },
      });

      return NextResponse.json({ ok: true, conversation: updated });
    }

    if (action === "resetFail") {
      const updated = await db.conversation.update({
        where: { id },
        data: { failCount: 0 },
      });

      return NextResponse.json({ ok: true, conversation: updated });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
