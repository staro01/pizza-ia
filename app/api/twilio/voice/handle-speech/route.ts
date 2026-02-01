import { NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function xml(body: string) {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function getBaseUrl(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}

function ttsUrl(baseUrl: string, text: string) {
  return `${baseUrl}/api/tts/audio.ulaw?text=${encodeURIComponent(text)}`;
}

function normPhone(p?: string | null) {
  return (p ?? "").trim().replace(/\s+/g, "");
}

/**
 * ✅ Règles:
 * - si mapping twilioNumber->restaurant existe => on prend
 * - sinon si 1 seul restaurant en DB => on prend celui-là (mode single resto)
 * - sinon => null (et là tu peux choisir de refuser l’appel)
 */
async function resolveRestaurantId(to?: string | null) {
  const twilioNumber = normPhone(to);

  if (twilioNumber) {
    const mapped = await prisma.restaurant.findFirst({
      where: { twilioNumber },
      select: { id: true },
    });
    if (mapped?.id) return mapped.id;
  }

  // fallback : si un seul restaurant en DB, on l'utilise
  const count = await prisma.restaurant.count();
  if (count === 1) {
    const only = await prisma.restaurant.findFirst({ select: { id: true } });
    return only?.id ?? null;
  }

  return null;
}

const MENU = [
  { key: "margherita", label: "Margherita", price: 10 },
  { key: "reine", label: "Reine", price: 11 },
  { key: "pepperoni", label: "Pepperoni", price: 12 },
];

function norm(s: string) {
  return (s ?? "").toLowerCase().trim();
}

function wantsMenu(s: string) {
  const t = norm(s);
  return (
    t.includes("menu") ||
    t.includes("quelles") ||
    t.includes("vous avez") ||
    t.includes("propose") ||
    t.includes("c'est quoi") ||
    t.includes("qu'est ce")
  );
}

function detectPizza(s: string) {
  const t = norm(s);
  return MENU.find((p) => t.includes(p.key)) ?? null;
}

function detectType(s: string): "delivery" | "takeaway" | null {
  const t = norm(s);
  if (t.includes("livraison") || t.includes("domicile") || t.includes("livrer")) return "delivery";
  if (
    t.includes("emporter") ||
    t.includes("a emporter") ||
    t.includes("à emporter") ||
    t.includes("venir chercher")
  )
    return "takeaway";
  return null;
}

function isYes(s: string) {
  const t = norm(s);
  return t === "oui" || t.includes("oui") || t.includes("ok") || t.includes("d'accord") || t.includes("parfait");
}

function isNo(s: string) {
  const t = norm(s);
  return t === "non" || t.includes("non");
}

function menuSentence() {
  return `Nous avons : ${MENU.map((p) => `${p.label} à ${p.price} euros`).join(", ")}. Quelle pizza souhaitez-vous ?`;
}

function gatherPlay(baseUrl: string, step: string, text: string) {
  const action = `${baseUrl}/api/twilio/voice/handle-speech?step=${step}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather
    input="speech"
    language="fr-FR"
    speechTimeout="auto"
    actionOnEmptyResult="true"
    action="${action}"
    method="POST"
  >
    <Play>${ttsUrl(baseUrl, text)}</Play>
  </Gather>

  <Play>${ttsUrl(baseUrl, "Je n’ai pas entendu. Répétez s’il vous plaît.")}</Play>
  <Redirect method="POST">${action}</Redirect>
</Response>`;
}

export async function POST(req: NextRequest) {
  const baseUrl = getBaseUrl(req);
  const redirectIncoming = `${baseUrl}/api/twilio/voice/incoming`;

  try {
    const url = new URL(req.url);
    const step = url.searchParams.get("step") ?? "listen";

    const form = await req.formData();
    const speech = (form.get("SpeechResult") ?? "").toString();
    const callSid = (form.get("CallSid") ?? "").toString();
    const to = (form.get("To") ?? "").toString();

    const restaurantId = await resolveRestaurantId(to);

    // ✅ option: si tu veux refuser quand pas de resto trouvé
    // si (restaurantId == null) => message + hangup
    // pour l’instant on laisse le fallback single-resto faire le job

    async function getOrCreateOrder() {
      if (!callSid) {
        return prisma.order.create({
          data: {
            status: "draft",
            type: "takeaway",
            total: 0,
            product: "",
            size: "",
            extras: "",
            restaurantId,
          },
        });
      }

      const order = await prisma.order.upsert({
        where: { clientOrderId: callSid },
        update: {},
        create: {
          clientOrderId: callSid,
          status: "draft",
          type: "takeaway",
          product: "",
          size: "",
          extras: "",
          total: 0,
          restaurantId,
        },
      });

      if (!order.restaurantId && restaurantId) {
        return prisma.order.update({
          where: { id: order.id },
          data: { restaurantId },
        });
      }

      return order;
    }

    if (step === "listen") {
      const order = await getOrCreateOrder();

      if (!speech.trim() || wantsMenu(speech)) {
        return xml(gatherPlay(baseUrl, "listen", menuSentence()));
      }

      const pizza = detectPizza(speech);
      if (!pizza) {
        return xml(gatherPlay(baseUrl, "listen", `Je n’ai pas reconnu la pizza. ${menuSentence()}`));
      }

      await prisma.order.update({
        where: { id: order.id },
        data: { product: pizza.label, total: pizza.price },
      });

      return xml(gatherPlay(baseUrl, "type", `Ok, une ${pizza.label}. Livraison ou à emporter ?`));
    }

    if (step === "type") {
      const order = await getOrCreateOrder();
      const type = detectType(speech);

      if (!type) {
        return xml(gatherPlay(baseUrl, "type", "Livraison ou à emporter ?"));
      }

      await prisma.order.update({ where: { id: order.id }, data: { type } });

      return type === "delivery"
        ? xml(gatherPlay(baseUrl, "name", "Votre nom s’il vous plaît ?"))
        : xml(gatherPlay(baseUrl, "name_takeaway", "Quel nom pour la commande ?"));
    }

    if (step === "name") {
      const order = await getOrCreateOrder();
      if (!speech.trim()) return xml(gatherPlay(baseUrl, "name", "Votre nom s’il vous plaît ?"));

      await prisma.order.update({ where: { id: order.id }, data: { customerName: speech.trim() } });
      return xml(gatherPlay(baseUrl, "address", "Votre adresse complète ?"));
    }

    if (step === "address") {
      const order = await getOrCreateOrder();
      if (!speech.trim()) return xml(gatherPlay(baseUrl, "address", "Votre adresse complète ?"));

      await prisma.order.update({ where: { id: order.id }, data: { address: speech.trim() } });
      return xml(gatherPlay(baseUrl, "phone", "Votre numéro de téléphone ?"));
    }

    if (step === "phone") {
      const order = await getOrCreateOrder();
      if (!speech.trim()) return xml(gatherPlay(baseUrl, "phone", "Votre numéro de téléphone ?"));

      const updated = await prisma.order.update({
        where: { id: order.id },
        data: { phone: speech.trim() },
      });

      const recap = `Récap : une ${updated.product}, en livraison. Total ${updated.total} euros. C’est bon pour vous ?`;
      return xml(gatherPlay(baseUrl, "confirm", recap));
    }

    if (step === "name_takeaway") {
      const order = await getOrCreateOrder();
      if (!speech.trim()) return xml(gatherPlay(baseUrl, "name_takeaway", "Quel nom pour la commande ?"));

      const updated = await prisma.order.update({
        where: { id: order.id },
        data: { customerName: speech.trim() },
      });

      const recap = `Récap : une ${updated.product}, à emporter. Total ${updated.total} euros. C’est bon pour vous ?`;
      return xml(gatherPlay(baseUrl, "confirm", recap));
    }

    if (step === "confirm") {
      const order = await getOrCreateOrder();

      if (isYes(speech)) {
        await prisma.order.update({ where: { id: order.id }, data: { status: "confirmed" } });

        return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${ttsUrl(baseUrl, "Parfait. Merci beaucoup. À bientôt.")}</Play>
  <Hangup/>
</Response>`);
      }

      if (isNo(speech)) {
        await prisma.order.update({
          where: { id: order.id },
          data: { status: "draft", product: "", total: 0 },
        });

        return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${ttsUrl(baseUrl, "D’accord, on recommence.")}</Play>
  <Redirect method="POST">${redirectIncoming}</Redirect>
</Response>`);
      }

      return xml(gatherPlay(baseUrl, "confirm", "Dites oui ou non. C’est bon ?"));
    }

    return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">${redirectIncoming}</Redirect>
</Response>`);
  } catch (err) {
    console.error("handle-speech error:", err);
    const baseUrl = getBaseUrl(req);
    return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${ttsUrl(baseUrl, "Une erreur est survenue. Merci de rappeler.")}</Play>
  <Hangup/>
</Response>`);
  }
}
