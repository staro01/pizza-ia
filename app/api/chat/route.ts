import { NextResponse } from "next/server";
import OpenAI from "openai";
import { SYSTEM_PROMPT } from "@/ai/systemPrompt";
import { prisma } from "@/lib/prisma";
import { CreateOrderSchema } from "@/lib/validators/order";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function tryParseJsonStrict(text: string): any | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}
async function generateAssistantReply(input: Array<{ role: string; content: string }>) {
  // ✅ 1) Responses API si dispo
  const responses = (client as any).responses;
  if (responses && typeof responses.create === "function") {
    const resp = await responses.create({
      model: "gpt-5",
      reasoning: { effort: "low" },
      input,
    });
    return (resp.output_text || "").trim();
  }

  // 🔁 2) Fallback Chat Completions (fonctionne même si `responses` est absent)
  const messages = input.map((m) => ({
    role: m.role === "developer" ? "developer" : m.role, // chat.completions accepte "developer"
    content: m.content,
  }));

  const resp = await (client as any).chat.completions.create({
    model: "gpt-4o-mini",
    messages,
  });

  return (resp.choices?.[0]?.message?.content || "").trim();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const userMessage: string = typeof body?.message === "string" ? body.message.trim() : "";
    const conversationId: string | undefined =
      typeof body?.conversationId === "string" ? body.conversationId : undefined;

    if (!userMessage) {
      return NextResponse.json({ error: "`message` est requis" }, { status: 400 });
    }

    // 1) Créer ou charger conversation
    const conversation =
      conversationId
        ? await prisma.conversation.findUnique({ where: { id: conversationId } })
        : await prisma.conversation.create({ data: {} });

    if (!conversation) {
      return NextResponse.json({ error: "conversationId invalide" }, { status: 404 });
    }

    if (conversation.status === "completed") {
      return NextResponse.json(
        { error: "Cette conversation est déjà terminée. Crée une nouvelle conversation." },
        { status: 409 }
      );
    }

    // 2) Enregistrer le message user
    await prisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: userMessage,
      },
    });

    // 3) Récupérer l'historique (limite pour éviter de grossir)
    // On prend les 30 derniers messages (tu peux ajuster)
    const history = await prisma.conversationMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      take: 30,
    });

    // 4) Construire l'input OpenAI
    const input = [
      { role: "developer" as const, content: SYSTEM_PROMPT },
      ...history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const replyText = await generateAssistantReply(input);

    // 6) Enregistrer la réponse assistant
    await prisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: replyText,
      },
    });

    // 7) Si JSON final => valider + créer la commande
    const maybeJson = tryParseJsonStrict(replyText);
    if (maybeJson) {
      const parsed = CreateOrderSchema.safeParse(maybeJson);

      if (!parsed.success) {
        return NextResponse.json({
          conversationId: conversation.id,
          reply: "JSON reçu mais invalide (validation).",
          orderCreated: false,
          issues: parsed.error.flatten(),
          jsonReceived: maybeJson,
        });
      }

      const data = parsed.data;

      if (
        data.orderType === "DELIVERY" &&
        (!data.address || !data.city || !data.postalCode)
      ) {
        return NextResponse.json({
          conversationId: conversation.id,
          reply: "JSON reçu mais infos livraison manquantes.",
          orderCreated: false,
          missing: ["address", "city", "postalCode"],
        });
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
          total: 0,
          items: {
            create: data.items.map((item: any) => ({
              productId: item.productId,
              size: item.size ?? null,
              quantity: item.quantity ?? 1,
              extras: item.extras ?? [],
            })),
          },
        },
        include: { items: true },
      });

      // Marquer conversation terminée
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: "completed" },
      });

      return NextResponse.json(
        {
          conversationId: conversation.id,
          reply: "Commande créée ✅",
          orderCreated: true,
          order,
        },
        { status: 201 }
      );
    }

    // 8) Réponse normale
    return NextResponse.json({
      conversationId: conversation.id,
      reply: replyText,
      orderCreated: false,
    });
  } catch (err: any) {
    const msg = err?.message ?? String(err);

    // Meilleur message si billing/quota
    if (msg.includes("429") || msg.toLowerCase().includes("quota")) {
      return NextResponse.json(
        {
          error: "OpenAI: quota/billing",
          details:
            "Quota dépassé ou billing non actif. Vérifie platform.openai.com > Billing/Usage.",
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: "Erreur serveur / OpenAI", details: msg },
      { status: 500 }
    );
  }
}
