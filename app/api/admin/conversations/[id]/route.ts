import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, context: any) {
  try {
    const id = context?.params?.id as string;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: {
        id: true,
        externalId: true,
        createdAt: true,
        transcript: true,
        messages: true,
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ conversation });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
