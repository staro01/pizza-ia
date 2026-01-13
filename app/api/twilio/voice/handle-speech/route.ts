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

function normalizeSpeech(s: string) {
  return (s ?? "").toLowerCase().trim();
}

function detectType(s: string): "delivery" | "takeaway" | null {
  const t = normalizeSpeech(s);

  if (t.includes("livraison") || t.includes("domicile") || t.includes("livrer")) return "delivery";
  if (t.includes("emporter") || t.includes("à emporter") || t.includes("a emporter") || t.includes("à récupérer") || t.includes("recuperer"))
    return "takeaway";

  return null;
}

export async function POST(req: NextRequest) {
  const baseUrl = getBaseUrl(req);
  const redirectIncoming = `${baseUrl}/api/twilio/voice/incoming`;

  try {
    const url = new URL(req.url);
    const step = url.searchParams.get("step") ?? "type";

    const form = await req.formData();
    const speechRaw = (form.get("SpeechResult") ?? "").toString();
    const callSid = (form.get("CallSid") ?? "").toString();

    // ✅ DEBUG vocal : on te dit ce que Twilio a réellement envoyé
    const heard = speechRaw ? `J'ai entendu : ${speechRaw}.` : `Je n'ai rien reçu.`;

    if (step === "type") {
      const type = detectType(speechRaw);

      if (!type) {
        return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="fr-FR" voice="alice">${heard}</Say>
  <Say language="fr-FR" voice="alice">Désolé, je n’ai pas compris. Dis “livraison” ou “à emporter”.</Say>
  <Redirect method="POST">${redirectIncoming}</Redirect>
</Response>`);
      }

      // ✅ Crée/maj la commande liée à cet appel (CallSid = clientOrderId)
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
        order = await prisma.order.update({
          where: { id: order.id },
          data: { type, status: "confirmed" },
        });
      }

      return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="fr-FR" voice="alice">${heard}</Say>
  <Say language="fr-FR" voice="alice">Parfait. Commande créée.</Say>
  <Hangup/>
</Response>`);
    }

    return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">${redirectIncoming}</Redirect>
</Response>`);
  } catch (err: any) {
    console.error("handle-speech error:", err);
    return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="fr-FR" voice="alice">Erreur serveur. Merci de rappeler.</Say>
  <Hangup/>
</Response>`);
  }
}
