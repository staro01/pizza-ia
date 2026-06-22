import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "../../../lib/prisma";

function sse(data: any) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const role = String((user.publicMetadata as any)?.role ?? "").toUpperCase();
  let restaurantId: string | null = null;

  if (role !== "ADMIN") {
    const restaurant = await prisma.restaurant.findUnique({
      where: { clerkUserId: user.id },
      select: { id: true },
    });
    restaurantId = restaurant?.id ?? "__none__";
  }

  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      function send(data: string) {
        if (closed) return;
        try { controller.enqueue(encoder.encode(data)); } catch { closed = true; }
      }

      send(sse({ type: "connected" }));

      const interval = setInterval(async () => {
        if (closed) { clearInterval(interval); return; }
        try {
          const where = role === "ADMIN" ? {} : { restaurantId: restaurantId === "__none__" ? null : restaurantId };
          const orders = await prisma.order.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });
          send(sse({ type: "orders", ts: Date.now(), orders }));
        } catch { send(sse({ type: "error" })); }
      }, 2000);

      const keepalive = setInterval(() => {
        if (closed) { clearInterval(keepalive); return; }
        send(`: keepalive ${Date.now()}\n\n`);
      }, 15000);

      const watchdog = setInterval(() => {
        if (closed) { clearInterval(watchdog); clearInterval(interval); clearInterval(keepalive); }
      }, 5000);
    },
    cancel() { closed = true; }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
