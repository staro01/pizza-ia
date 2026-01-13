import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  const id = params.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const db: any = prisma;

  const order = await db.order.findUnique({
    where: { id },
    include: { items: true },
  });

  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ order });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const id = params.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const db: any = prisma;

  await db.order.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
