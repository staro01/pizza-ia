import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "../../../lib/prisma";

function sse(data: any) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function GET() {
  const user = await currentUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const role = String((user.publicMetadata as any)?.role ?? "").toUpperCase();

  // restaurant scope si RESTAURANT
  let restaurantId: string | null = null;

  if (role !== "ADMIN") {
    const restaurant = await prisma.restaurant.findUnique({
      where: { clerkUserId: user.id },
      select: { id: true },
    });
    restaurantId = restaurant?.id ?? null;

    if (!restaurantId) {
      // Pas de resto lié => on garde le stream mais vide
      restaurantId = "__none__";
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // ping initial
      controller.enqueue(encoder.encode(sse({ type: "connected" })));

      let lastSeen = Date.now();

      // boucle : on pousse un snapshot toutes les 2s (léger, mais “temps réel” côté UI)
      // (on optimisera ensuite avec diff si besoin)
      const interval = setInterval(async () => {
        try {
          const where =
            role === "ADMIN"
              ? {}
              : { restaurantId: restaurantId === "__none__" ? null : restaurantId };

          const orders = await prisma.order.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: 200,
          });

          controller.enqueue(
            encoder.encode(
              sse({
                type: "orders",
                ts: Date.now(),
                orders,
              })
            )
          );

          lastSeen = Date.now();
        } catch (e) {
          controller.enqueue(encoder.encode(sse({ type: "error" })));
        }
      }, 2000);

      // keepalive comment (évite certaines coupures proxy)
      const keepalive = setInterval(() => {
        controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
      }, 15000);

      // cleanup si stream fermé
      const close = () => {
        clearInterval(interval);
        clearInterval(keepalive);
        try {
          controller.close();
        } catch {}
      };

      // si plus d’activité depuis 60s, on ferme (clients se reconnectent)
      const watchdog = setInterval(() => {
        if (Date.now() - lastSeen > 60000) close();
      }, 10000);

      // @ts-ignore
      controller.closed?.then(() => {
        clearInterval(interval);
        clearInterval(keepalive);
        clearInterval(watchdog);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
