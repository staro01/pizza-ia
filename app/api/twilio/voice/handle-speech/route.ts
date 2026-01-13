import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function xml(body: string) {
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

function getBaseUrl(req: NextRequest) {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  if (!host) return "";
  return `${proto}://${host}`;
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
    t.includes("qu") && (t.includes("pizza") || t.includes("propose") || t.includes("menu")) ||
    t.includes("c'est quoi") ||
    t.includes("qu'est ce") ||
    t.includes("quelles pizzas") ||
    t.includes("vous avez quoi")
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
    t.includes("à emporter") ||
    t.includes("a emporter") ||
    t.includes("venir chercher") ||
    t.includes("sur place") ||
    t.includes("récupérer") ||
    t.includes("recuperer")
  ) return "takeaway";
  return null;
}

function isYes(s: string) {
  const t = norm(s);
  return t === "oui" || t.includes("oui") || t.includes("ok") || t.includes("d'accord") || t.includes("c'est bon") || t.includes("parfait");
}
function isNo(s: string) {
  const t = norm(s);
  return t === "non" || t.includes("non") || t.includes("pas") || t.includes("nope");
}

function menuSentence() {
  // Phrase courte et claire
  return `Nous avons : ${MENU.map((p) => `${p.label} à ${p.price} euros`).join(", ")}. Quelle pizza souhaitez-vous ?`;
}

function gatherSay(baseUrl: string, step: string, text: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="fr-FR" speechTimeout="auto"
    action="${baseUrl}/api/twilio/voice/handle-speech?step=${step}" method="POST">
    <Say language="fr-FR" voice="alice">${text}</Say>
  </Gather>
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

    // On travaille toujours avec la commande liée à l'appel
    // NOTE: upsert par CallSid => simple et stable
    async function getOrCreateOrder() {
      if (!callSid) {
        // fallback très rare, mais on évite de planter
        return prisma.order.create({
          data: { status: "draft", type: "takeaway", total: 0, product: "" },
        });
      }

      return prisma.order.upsert({
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
        },
      });
    }

    // STEP: listen (pizza ou demande menu)
    if (step === "listen") {
      const order = await getOrCreateOrder();

      if (wantsMenu(speech) || !speech.trim()) {
        return xml(gatherSay(baseUrl, "listen", menuSentence()));
      }

      const pizza = detectPizza(speech);
      if (!pizza) {
        return xml(
          gatherSay(
            baseUrl,
            "listen",
            `Désolé, je n’ai pas reconnu la pizza. ${menuSentence()}`
          )
        );
      }

      await prisma.order.update({
        where: { id: order.id },
        data: {
          product: pizza.label,
          total: pizza.price,
          status: "draft",
        },
      });

      return xml(
        gatherSay(
          baseUrl,
          "type",
          `D’accord pour une ${pizza.label}. Ce sera en livraison ou à venir chercher sur place ?`
        )
      );
    }

    // STEP: type (delivery / takeaway)
    if (step === "type") {
      const order = await getOrCreateOrder();
      const type = detectType(speech);

      if (!type) {
        return xml(
          gatherSay(
            baseUrl,
            "type",
            `Désolé, je n’ai pas compris. Livraison ou à venir chercher ?`
          )
        );
      }

      await prisma.order.update({
        where: { id: order.id },
        data: { type },
      });

      if (type === "delivery") {
        return xml(gatherSay(baseUrl, "name", `Très bien. Quel est votre nom, s’il vous plaît ?`));
      }

      // takeaway
      return xml(gatherSay(baseUrl, "name_takeaway", `D’accord. Quel nom pour la commande ?`));
    }

    // STEP: name (delivery)
    if (step === "name") {
      const order = await getOrCreateOrder();
      const name = speech.trim();

      if (!name) {
        return xml(gatherSay(baseUrl, "name", `Je n’ai pas entendu. Quel est votre nom ?`));
      }

      await prisma.order.update({
        where: { id: order.id },
        data: { customerName: name },
      });

      return xml(gatherSay(baseUrl, "address", `Merci ${name}. Quelle est votre adresse complète ?`));
    }

    // STEP: address (delivery)
    if (step === "address") {
      const order = await getOrCreateOrder();
      const address = speech.trim();

      if (!address) {
        return xml(gatherSay(baseUrl, "address", `Je n’ai pas entendu. Quelle est votre adresse complète ?`));
      }

      await prisma.order.update({
        where: { id: order.id },
        data: { address },
      });

      return xml(gatherSay(baseUrl, "phone", `Merci. Quel est votre numéro de téléphone ?`));
    }

    // STEP: phone (delivery)
    if (step === "phone") {
      const order = await getOrCreateOrder();
      const phone = speech.trim();

      if (!phone) {
        return xml(gatherSay(baseUrl, "phone", `Je n’ai pas entendu. Quel est votre numéro de téléphone ?`));
      }

      const updated = await prisma.order.update({
        where: { id: order.id },
        data: { phone },
      });

      // récap + confirm
      const recap = `Récapitulatif : une ${updated.product}. Livraison. Nom : ${updated.customerName}. Adresse : ${updated.address}. Total : ${updated.total} euros. C’est ok ?`;
      return xml(gatherSay(baseUrl, "confirm", recap));
    }

    // STEP: name_takeaway
    if (step === "name_takeaway") {
      const order = await getOrCreateOrder();
      const name = speech.trim();

      if (!name) {
        return xml(gatherSay(baseUrl, "name_takeaway", `Je n’ai pas entendu. Quel nom pour la commande ?`));
      }

      const updated = await prisma.order.update({
        where: { id: order.id },
        data: { customerName: name },
      });

      const recap = `Récapitulatif : une ${updated.product}. À venir chercher. Nom : ${updated.customerName}. Total : ${updated.total} euros. C’est ok ?`;
      return xml(gatherSay(baseUrl, "confirm", recap));
    }

    // STEP: confirm
    if (step === "confirm") {
      const order = await getOrCreateOrder();

      if (isYes(speech)) {
        await prisma.order.update({
          where: { id: order.id },
          data: { status: "confirmed" },
        });

        return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="fr-FR" voice="alice">Parfait. Merci, au revoir.</Say>
  <Pause length="1"/>
  <Hangup/>
</Response>`);
      }

      if (isNo(speech)) {
        // on recommence
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "draft",
            // on peut garder ou reset; là je reset pour éviter confusion
            product: "",
            total: 0,
            type: "takeaway",
            customerName: null,
            address: null,
            phone: null,
          },
        });

        return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="fr-FR" voice="alice">D’accord, on recommence.</Say>
  <Redirect method="POST">${redirectIncoming}</Redirect>
</Response>`);
      }

      // si réponse floue
      return xml(gatherSay(baseUrl, "confirm", `Je n’ai pas compris. C’est ok ? Répondez oui ou non.`));
    }

    // fallback
    return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">${redirectIncoming}</Redirect>
</Response>`);
  } catch (err) {
    console.error("handle-speech error:", err);
    return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="fr-FR" voice="alice">Une erreur est survenue. Merci de rappeler.</Say>
  <Hangup/>
</Response>`);
  }
}
