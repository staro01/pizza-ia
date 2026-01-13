import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

function normalizeSpeech(s: string) {
  return (s ?? "").toLowerCase().trim();
}

function detectType(s: string): "delivery" | "takeaway" | null {
  const t = normalizeSpeech(s);

  // livraison
  if (t.includes("livraison") || t.includes("livrer") || t.includes("à domicile") || t.includes("domicile")) {
    return "delivery";
  }

  // à emporter
  if (
    t.includes("emporter") ||
    t.includes("à emporter") ||
    t.includes("a emporter") ||
    t.includes("sur place") || // optionnel
    t.includes("à récupérer") ||
    t.includes("recuperer")
  ) {
    return "takeaway";
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const step = url.searchParams.get("step") ?? "type";

    // Twilio envoie du x-www-form-urlencoded => formData()
    const form = await req.formData();
    const speechRaw = (form.get("SpeechResult") ?? "").toString();
    const callSid = (form.get("CallSid") ?? "").toString(); // très utile comme identifiant
    const baseUrl = getBaseUrl(req);

    const redirectIncoming = `${baseUrl}/api/twilio/voice/incoming`;

    // ✅ Etape 1 : livraison / emporter => on crée une Order
    if (step === "type") {
      const type = detectType(speechRaw);

      if (!type) {
        return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="fr-FR" voice="alice">Désolé, je n’ai pas compris. Livraison ou à emporter ?</Say>
  <Redirect method="POST">${redirectIncoming}</Redirect>
</Response>`);
      }

      // ✅ Création (ou réutilisation) de la commande de cet appel
      // On se sert de CallSid comme clientOrderId unique.
      let order = null;

      if (callSid) {
        order = await prisma.order.findFirst({ where: { clientOrderId: callSid } });
      }

      if (!order) {
        order = await prisma.order.create({
          data: {
            clientOrderId: callSid || null,
            type,
            status: "confirmed",
            product: "",
            size: "",
            extras: "",
            total: 0,
          },
        });
      } else {
        // si déjà créée, on met juste à jour le type
        order = await prisma.order.update({
          where: { id: order.id },
          data: { type, status: "confirmed" },
        });
      }

      return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="fr-FR" voice="alice">Parfait, c’est noté.</Say>
  <Say language="fr-FR" voice="alice">Merci, à tout de suite.</Say>
  <Hangup/>
</Response>`);
    }

    // fallback
    return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">${redirectIncoming}</Redirect>
</Response>`);
  } catch (err: any) {
    console.error("handle-speech error:", err);
    // Toujours renvoyer du TwiML, sinon Twilio plante
    return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="fr-FR" voice="alice">Une erreur est survenue. Merci de rappeler.</Say>
  <Hangup/>
</Response>`);
  }
}
