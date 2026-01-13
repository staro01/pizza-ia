import { NextResponse } from "next/server";
import { CreateOrderSchema } from "@/lib/validators/order";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const body = await req.json();

  const parsed = CreateOrderSchema.safeParse(body);

  // si invalide -> on renvoie une erreur claire
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const data = parsed.data;

  // règle simple : si livraison, adresse obligatoire
  if (data.orderType === "DELIVERY" && (!data.address || !data.city || !data.postalCode)) {
    return NextResponse.json(
      { error: "Missing delivery info", missing: ["address", "city", "postalCode"] },
      { status: 422 }
    );
  }

  const order = await prisma.order.create({
    data: {
      status: "confirmed",
      type: data.orderType,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      address: data.address ?? null,
      city: data.city ?? null,
      postalCode: data.postalCode ?? null,
      items: {
  create: data.items.map((item: any) => ({
    productId: item.productId,
    size: item.size ?? null,
    quantity: item.quantity ?? 1,
    extras: item.extras,
  })),
},

    },
    include: { items: true },
  });

  return NextResponse.json({ order }, { status: 201 });
}
