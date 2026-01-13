import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const take = Math.min(Number(searchParams.get("take") ?? 50), 200);

    const db: any = prisma;

    const conversations = await db.conversation.findMany({
      orderBy: { createdAt: "desc" },
      take,
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
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
