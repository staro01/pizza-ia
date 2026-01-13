import { NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { SYSTEM_PROMPT_VOICE } from "@/ai/systemPrompt.voice";
import { CreateOrderSchema } from "@/lib/validators/order";
import { ConversationStatus, OrderStatus, OrderType } from "@prisma/client";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** ----------------- Helpers intents ----------------- */
function isCancelIntent(text: string) {
  return /annule|annuler|laisser tomber|stop|abandonne/i.test(text);
}
function isHumanIntent(text: string) {
  return /humain|quelqu'un|personne|employé|gérant|manager/i.test(text);
}
function isYes(text: string) {
  return /^(oui|ouais|ok|d'accord|je confirme|confirm(e|er)|vas-y|c'est bon|bien sûr)$/i.test(
    text.trim()
  );
}
function isNo(text: string) {
  return /^(non|nope|nan|pas du tout|annule|stop|je ne confirme pas)$/i.test(
    text.trim()
  );
}

/** ----------------- Helpers Twilio/XML ----------------- */
function xml(body: string) {
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
function getBaseUrl(req: Request) {
  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  if (!host) return "";
  return `${proto}://${host}`;
}
function escapeXml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
function tryParseJsonStrict(text: string): any | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

async function generateAssistantReply(
  input: Array<{ role: string; content: string }>
) {
  const responses = (client as any).responses;
  if (responses && typeof responses.create === "function") {
    const resp = await responses.create({
      model: "gpt-5",
      reasoning: { effort: "low" },
      input,
    });
    return (resp.output_text || "").trim();
  }

  const messages = input.map((m) => ({
    role: m.role === "developer" ? "developer" : m.role,
    content: m.content,
  }));

  const resp = await (client as any).chat.completions.create({
    model: "gpt-4o-mini",
    messages,
  });

  return (resp.choices?.[0]?.message?.content || "").trim();
}

/** ----------------- Business validation helpers ----------------- */
function normalizePhone(phone: string) {
  const p = phone.trim().replace(/[^\d+]/g, "");
  return p;
}
function looksLikePhone(phone: string) {
  const p = normalizePhone(phone);
  const digits = p.replace(/\+/g, "");
  return digits.length >= 9 && digits.length <= 15;
}

function missingFieldsForOrder(data: any): string[] {
  const missing: string[] = [];

  if (!data?.orderType) missing.push("type de commande (livraison ou à emporter)");
  if (!data?.customerName) missing.push("nom");
  if (!data?.customerPhone) missing.push("numéro de téléphone");
  if (!Array.isArray(data?.items) || data.items.length === 0)
    missing.push("au moins un produit");

  if (data?.orderType === "DELIVERY") {
    if (!data?.address) missing.push("adresse");
    if (!data?.city) missing.push("ville");
    if (!data?.postalCode) missing.push("code postal");
  }

  if (data?.customerPhone && !looksLikePhone(data.customerPhone)) {
    missing.push("un numéro de téléphone valide");
  }

  return missing;
}

function buildConfirmationSentence(data: any) {
  const typeLabel =
    data.orderType === "DELIVERY" ? "en livraison" : "à emporter";

  const items = (data.items || [])
    .map((it: any) => {
      const qty = it.quantity ?? 1;
      const size = it.size ? `, taille ${it.size}` : "";
      return `${qty} ${it.productId}${size}`;
    })
    .join(", ");

  const addressPart =
    data.orderType === "DELIVERY"
      ? `à l’adresse ${data.address}, ${data.postalCode} ${data.city}`
      : "";

  return `Tu confirmes : ${items}, ${typeLabel} ${addressPart} ? Réponds "oui" pour confirmer ou "non" pour corriger.`;
}

function assistantAskedForConfirmation(lastAssistantMsg?: string) {
  if (!lastAssistantMsg) return false;
  return /tu confirmes|réponds "oui"|réponds 'oui'|oui pour confirmer|confirmer/i.test(
    lastAssistantMsg
  );
}

const MAX_FAILS_BEFORE_FALLBACK = 3;

export async function POST(req: Request) {
  const baseUrl = getBaseUrl(req);

  // ✅ IMPORTANT: routes Twilio alignées avec ton arborescence Next
  const againUrl = `${baseUrl}/api/twilio/voice/handle-speech`;
  const incomingUrl = `${baseUrl}/api/twilio/voice/incoming`;

  const form = await req.formData();
  const callSid = String(form.get("CallSid") ?? "");
  const speech = String(form.get("SpeechResult") ?? "").trim();

  if (!callSid) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="fr-FR" voice="alice">Erreur technique. Identifiant d’appel manquant.</Say>
  <Hangup/>
</Response>`;
    return xml(twiml);
  }

  const conversation = await prisma.conversation.upsert({
    where: { externalId: callSid },
    update: {},
    create: { externalId: callSid },
  });

  if (conversation.status === ConversationStatus.completed) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="fr-FR" voice="alice">Merci ! La commande est déjà enregistrée. À bientôt.</Say>
  <Hangup/>
</Response>`;
    return xml(twiml);
  }

  if (conversation.status === ConversationStatus.cancelled) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="fr-FR" voice="alice">D’accord. La commande a déjà été annulée. À bientôt.</Say>
  <Hangup/>
</Response>`;
    return xml(twiml);
  }

  // Silence → failCount + reprompt
  if (!speech) {
    const updated = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { failCount: { increment: 1 } },
    });

    if (updated.failCount >= MAX_FAILS_BEFORE_FALLBACK) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: ConversationStatus.cancelled, cancelledAt: new Date() },
      });

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="fr-FR" voice="alice">Je n’arrive pas à vous entendre. Je vous transfère au restaurant.</Say>
  <Hangup/>
</Response>`;
      return xml(twiml);
    }

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="fr-FR" speechTimeout="auto" action="${againUrl}" method="POST">
    <Say language="fr-FR" voice="alice">Je n’ai pas entendu. Tu peux répéter s’il te plaît ?</Say>
  </Gather>
  <Say language="fr-FR" voice="alice">On reprend depuis le début.</Say>
  <Redirect method="POST">${incomingUrl}</Redirect>
</Response>`;
    return xml(twiml);
  }

  // Annulation / humain (immédiat)
  if (isCancelIntent(speech)) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: ConversationStatus.cancelled, cancelledAt: new Date() },
    });

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="fr-FR" voice="alice">D’accord, j’annule la commande. À bientôt.</Say>
  <Hangup/>
</Response>`;
    return xml(twiml);
  }

  if (isHumanIntent(speech)) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="fr-FR" voice="alice">D’accord. Je transmets votre appel au restaurant.</Say>
  <Hangup/>
</Response>`;
    return xml(twiml);
  }

  // Enregistrer message user
  await prisma.conversationMessage.create({
    data: {
      conversationId: conversation.id,
      role: "user",
      content: speech,
    },
  });

  const history = await prisma.conversationMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    take: 40,
  });

  const lastAssistant = [...history].reverse().find((m) => m.role === "assistant");
  const lastAssistantContent = lastAssistant?.content ?? "";

  // ✅ Gestion CONFIRMATION oui/non
  if (assistantAskedForConfirmation(lastAssistantContent)) {
    if (isYes(speech)) {
      const lastJsonAssistant = [...history]
        .reverse()
        .find((m) => m.role === "assistant" && tryParseJsonStrict(m.content));

      const json = lastJsonAssistant ? tryParseJsonStrict(lastJsonAssistant.content) : null;

      if (!json) {
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="fr-FR" speechTimeout="auto" action="${againUrl}" method="POST">
    <Say language="fr-FR" voice="alice">Je n’ai pas retrouvé les détails de la commande. On reprend : que souhaites-tu commander ?</Say>
  </Gather>
</Response>`;
        return xml(twiml);
      }

      const parsed = CreateOrderSchema.safeParse(json);
      if (!parsed.success) {
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="fr-FR" speechTimeout="auto" action="${againUrl}" method="POST">
    <Say language="fr-FR" voice="alice">Il manque des informations pour finaliser. Dis-moi ce que tu veux corriger.</Say>
  </Gather>
</Response>`;
        return xml(twiml);
      }

      const data = parsed.data;
      const missing = missingFieldsForOrder(data);
      if (missing.length) {
        const msg = `Pour confirmer, j’ai besoin de : ${missing.join(", ")}.`;
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="fr-FR" speechTimeout="auto" action="${againUrl}" method="POST">
    <Say language="fr-FR" voice="alice">${escapeXml(msg)}</Say>
  </Gather>
</Response>`;
        return xml(twiml);
      }

      // ✅ Création commande
      await prisma.order.create({
        data: {
          status: OrderStatus.confirmed,
          type: data.orderType as OrderType,
          customerName: data.customerName,
          customerPhone: normalizePhone(data.customerPhone),
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
      });

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: ConversationStatus.completed, failCount: 0 },
      });

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="fr-FR" voice="alice">Parfait, c’est confirmé. Merci ! La commande est enregistrée. À bientôt.</Say>
  <Hangup/>
</Response>`;
      return xml(twiml);
    }

    if (isNo(speech)) {
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="fr-FR" speechTimeout="auto" action="${againUrl}" method="POST">
    <Say language="fr-FR" voice="alice">Ok, pas de souci. Qu’est-ce que tu veux modifier exactement ?</Say>
  </Gather>
</Response>`;
      return xml(twiml);
    }

    const updated = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { failCount: { increment: 1 } },
    });

    if (updated.failCount >= MAX_FAILS_BEFORE_FALLBACK) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: ConversationStatus.cancelled, cancelledAt: new Date() },
      });

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="fr-FR" voice="alice">Je n’ai pas compris la confirmation. Je vous transfère au restaurant.</Say>
  <Hangup/>
</Response>`;
      return xml(twiml);
    }

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="fr-FR" speechTimeout="auto" action="${againUrl}" method="POST">
    <Say language="fr-FR" voice="alice">Désolé, j’ai besoin d’un oui ou d’un non. Tu confirmes ?</Say>
  </Gather>
</Response>`;
    return xml(twiml);
  }

  // Reset failCount si on a une entrée exploitable
  if (conversation.failCount > 0) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { failCount: 0 },
    });
  }

  // Appel IA
  const input = [
    { role: "developer", content: SYSTEM_PROMPT_VOICE },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  const replyText = await generateAssistantReply(input);

  // Sauvegarder réponse assistant
  await prisma.conversationMessage.create({
    data: {
      conversationId: conversation.id,
      role: "assistant",
      content: replyText,
    },
  });

  // Si JSON -> on demande confirmation + compléments si besoin.
  const maybeJson = tryParseJsonStrict(replyText);
  if (maybeJson) {
    const parsed = CreateOrderSchema.safeParse(maybeJson);

    if (!parsed.success) {
      const updated = await prisma.conversation.update({
        where: { id: conversation.id },
        data: { failCount: { increment: 1 } },
      });

      if (updated.failCount >= MAX_FAILS_BEFORE_FALLBACK) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { status: ConversationStatus.cancelled, cancelledAt: new Date() },
        });

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="fr-FR" voice="alice">Je n’arrive pas à finaliser la commande. Je vous transfère au restaurant.</Say>
  <Hangup/>
</Response>`;
        return xml(twiml);
      }

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="fr-FR" speechTimeout="auto" action="${againUrl}" method="POST">
    <Say language="fr-FR" voice="alice">Il manque des informations. Peux-tu préciser ta commande s’il te plaît ?</Say>
  </Gather>
</Response>`;
      return xml(twiml);
    }

    const data = parsed.data;
    const missing = missingFieldsForOrder(data);

    if (missing.length > 0) {
      const question = `Pour finaliser, j’ai besoin de : ${missing.join(
        ", "
      )}. Peux-tu me les donner ?`;

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="fr-FR" speechTimeout="auto" action="${againUrl}" method="POST">
    <Say language="fr-FR" voice="alice">${escapeXml(question)}</Say>
  </Gather>
</Response>`;
      return xml(twiml);
    }

    const confirmText = buildConfirmationSentence(data);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="fr-FR" speechTimeout="auto" action="${againUrl}" method="POST">
    <Say language="fr-FR" voice="alice">${escapeXml(confirmText)}</Say>
  </Gather>
</Response>`;
    return xml(twiml);
  }

  // Réponse normale (non-JSON)
  const safeSay = escapeXml(replyText);
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="fr-FR" speechTimeout="auto" action="${againUrl}" method="POST">
    <Say language="fr-FR" voice="alice">${safeSay}</Say>
  </Gather>

  <Say language="fr-FR" voice="alice">Je n’ai pas entendu. On recommence.</Say>
  <Redirect method="POST">${incomingUrl}</Redirect>
</Response>`;

  return xml(twiml);
}
