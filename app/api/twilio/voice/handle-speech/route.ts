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

/* =========================
   MENU SIMPLE (EN DUR)
========================= */
const MENU = [
  { name: "margherita", label: "Margherita", price: 10 },
  { name: "reine", label: "Reine", price: 11 },
  { name: "pepperoni", label: "Pepperoni", price: 12 },
];

function normalize(s: string) {
  return (s ?? "").toLowerCase().trim();
}

function detectType(s: string): "delivery" | "takeaway" | null {
  const t = normalize(s);
  if (t.includes("livraison") || t.includes("domicile")) return "delivery";
  if (t.includes("emporter") || t.includes("à emporter") || t.includes("a emporter")) return "takeaway";
  return null;
}

function detectPizza(s: string) {
  const t = normalize(s);
  return MENU.find((p) => t.includes(p.name)) ?? null;
}

export async function POST(req: NextRequest) {
  const baseUrl = getBaseUrl(req);
  const redirectIncoming = `${baseUrl}/api/twilio/voice/incoming`;

  try {
    const url = new URL(req.url);
    const step = url.searchParams.get("step") ?? "type";

    const form = await req.formData();
    const speech = (form.get("SpeechResult") ?? "").toString();
    const callSid = (form.get("CallSid") ?? "").toString();

    /* =========================
       STEP 1 — TYPE (livraison / emporter)
    ========================= */
    if (step === "type") {
      const type = detectType(speech);

      if (!type) {
        return xml(`
<Response>
  <Say voice="alice" language="fr-FR">
    Désolé, je n’ai pas compris. Livraison ou à emporter ?
  </Say>
  <Redirect method="POST">${redirectIncoming}</Redirect>
</Response>`);
      }

      // création / mise à jour commande
      const order = await prisma.order.upsert({
        where: { clientOrderId: callSid },
        update: { type, status: "confirmed" },
        create: {
          clientOrderId: callSid,
          type,
          status: "confirmed",
          product: "",
          size: "",
          extras: "",
          total: 0,
        },
      });

      return xml(`
<Response>
  <Gather
    input="speech"
    language="fr-FR"
    action="${baseUrl}/api/twilio/voice/handle-speech?step=product"
    method="POST"
  >
    <Say voice="alice" language="fr-FR">
      Parfait. Quelle pizza voulez-vous ?
      Margherita à 10 euros, Reine à 11 euros,
      ou Pepperoni à 12 euros ?
    </Say>
  </Gather>
</Response>`);
    }

    /* =========================
       STEP 2 — PRODUIT (pizza)
    ========================= */
    if (step === "product") {
      const pizza = detectPizza(speech);

      if (!pizza) {
        return xml(`
<Response>
  <Say voice="alice" language="fr-FR">
    Désolé, je n’ai pas reconnu cette pizza.
  </Say>
  <Redirect method="POST">${redirectIncoming}</Redirect>
</Response>`);
      }

      await prisma.order.update({
        where: { clientOrderId: callSid },
        data: {
          product: pizza.label,
          total: pizza.price,
        },
      });

      return xml(`
<Response>
  <Say voice="alice" language="fr-FR">
  MODE MENU ACTIVÉ.
  Parfait. Quelle pizza voulez-vous ?
  Margherita à 10 euros, Reine à 11 euros,
  ou Pepperoni à 12 euros ?
</Say>
  <Hangup/>
</Response>`);
    }

    return xml(`<Response><Hangup/></Response>`);
  } catch (err) {
    console.error("handle-speech error:", err);
    return xml(`
<Response>
  <Say voice="alice" language="fr-FR">
    Une erreur est survenue. Merci de rappeler.
  </Say>
  <Hangup/>
</Response>`);
  }
}
