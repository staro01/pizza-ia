import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function isValidKey(key: string) {
  const k = (key ?? "").trim();
  return k && k !== "undefined" && k !== "null" && k !== "NaN";
}

async function findOrderByIdOrClientOrderId(key: string) {
  // 1) Essaye par id
  const byId = await prisma.order.findUnique({ where: { id: key } });
  if (byId) return byId;

  // 2) Essaye par clientOrderId
  const byClient = await prisma.order.findFirst({
    where: { clientOrderId: key },
  });

  return byClient;
}

// ⚠️ Next peut typer params comme Promise dans .next => on "await" pour être safe
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { id: key } = await context.params;

    if (!isValidKey(key)) {
      return NextResponse.json({ error: "Missing/invalid id" }, { status: 400 });
    }

    const order = await findOrderByIdOrClientOrderId(key);
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ order }, { status: 200 });
  } catch (err: any) {
    console.error("GET /api/orders/[id] error:", err);
    return NextResponse.json({ error: "Failed to fetch order" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { id: key } = await context.params;

    if (!isValidKey(key)) {
      return NextResponse.json({ error: "Missing/invalid id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const status = typeof body?.status === "string" ? body.status.trim() : "";

    if (!status) {
      return NextResponse.json({ error: "Missing status" }, { status: 400 });
    }

    const order = await findOrderByIdOrClientOrderId(key);
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status },
    });

    return NextResponse.json({ order: updated }, { status: 200 });
  } catch (err: any) {
    console.error("PATCH /api/orders/[id] error:", err);
    return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const { id: key } = await context.params;

    if (!isValidKey(key)) {
      return NextResponse.json({ error: "Missing/invalid id" }, { status: 400 });
    }

    const order = await findOrderByIdOrClientOrderId(key);
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.order.delete({ where: { id: order.id } });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    console.error("DELETE /api/orders/[id] error:", err);
    return NextResponse.json({ error: "Failed to delete order" }, { status: 500 });
  }
}
