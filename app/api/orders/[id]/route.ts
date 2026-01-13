import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const allowed = ["confirmed", "preparing", "ready", "done", "cancelled"] as const;
type AllowedStatus = (typeof allowed)[number];

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  return NextResponse.json({ ok: true, route: "GET /api/orders/[id]", id });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const key = decodeURIComponent(id);

  const body = await req.json().catch(() => ({}));
  const statusKey = String(body?.status ?? "").trim().toLowerCase();

  if (!key) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (!allowed.includes(statusKey as AllowedStatus)) {
    return NextResponse.json({ error: "Invalid status", allowed }, { status: 400 });
  }

  const status = statusKey as AllowedStatus;

  // 1) update par id Prisma
  try {
    const order = await prisma.order.update({
      where: { id: key },
      data: { status: status as any },
    });
    return NextResponse.json({ ok: true, order });
  } catch {}

  // 2) update par clientOrderId
  try {
    const order = await prisma.order.update({
      where: { clientOrderId: key },
      data: { status: status as any },
    });
    return NextResponse.json({ ok: true, order });
  } catch {}

  return NextResponse.json({ error: "Not found", key }, { status: 404 });
}
