import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  context: { params: { id: string } }
) {
  const id = context.params.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // cast "any" pour éviter les soucis de types si Prisma n'est pas à jour localement
  const db: any = prisma;

  const order = await db.order.findUnique({
    where: { id },
    include: { items: true },
  });

  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ order });
}

export async function DELETE(
  _req: Request,
  context: { params: { id: string } }
) {
  const id = context.params.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const db: any = prisma;

  await db.order.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
