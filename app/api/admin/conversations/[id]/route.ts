import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, context: any) {
  try {
    const id = context?.params?.id as string;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const db: any = prisma;

    const conversation = await db.conversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ conversation });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
