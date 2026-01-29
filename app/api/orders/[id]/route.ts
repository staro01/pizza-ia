import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "../../../lib/prisma";

function isValidKey(key: string) {
  const k = (key ?? "").trim();
  return k && k !== "undefined" && k !== "null" && k !== "NaN";
}

async function findOrderByIdOrClientOrderId(key: string) {
  const byId = await prisma.order.findUnique({ where: { id: key } });
  if (byId) return byId;

  return prisma.order.findFirst({ where: { clientOrderId: key } });
}

async function getAuthContext() {
  const user = await currentUser();
  if (!user) return { userId: null as string | null, role: undefined as string | undefined };

  const role = String((user.publicMetadata as any)?.role ?? "").toUpperCase();
  return { userId: user.id, role };
}

async function assertCanAccessOrder(
  order: { restaurantId: string | null },
  userId: string,
  role?: string
) {
  if (role === "ADMIN") return { ok: true as const };

  const restaurant = await prisma.restaurant.findUnique({
    where: { clerkUserId: userId },
    select: { id: true },
  });

  if (!restaurant) return { ok: false as const, status: 403, error: "Restaurant not linked" };

  if (!order.restaurantId || order.restaurantId !== restaurant.id) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return { ok: true as const };
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { userId, role } = await getAuthContext();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: key } = await context.params;
    if (!isValidKey(key)) {
      return NextResponse.json({ error: "Missing/invalid id" }, { status: 400 });
    }

    const order = await findOrderByIdOrClientOrderId(key);
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const access = await assertCanAccessOrder({ restaurantId: order.restaurantId ?? null }, userId, role);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    return NextResponse.json({ order }, { status: 200 });
  } catch (err: any) {
    console.error("GET /api/orders/[id] error:", err);
    return NextResponse.json({ error: "Failed to fetch order" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { userId, role } = await getAuthContext();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

    const access = await assertCanAccessOrder({ restaurantId: order.restaurantId ?? null }, userId, role);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

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
    const { userId, role } = await getAuthContext();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: key } = await context.params;
    if (!isValidKey(key)) {
      return NextResponse.json({ error: "Missing/invalid id" }, { status: 400 });
    }

    const order = await findOrderByIdOrClientOrderId(key);
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const access = await assertCanAccessOrder({ restaurantId: order.restaurantId ?? null }, userId, role);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    await prisma.order.delete({ where: { id: order.id } });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    console.error("DELETE /api/orders/[id] error:", err);
    return NextResponse.json({ error: "Failed to delete order" }, { status: 500 });
  }
}
