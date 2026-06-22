import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function xml(body: string) {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function getBaseUrl(req: Request) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}

function escapeXml(s: string) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function normPhone(p?: string | null) {
  const raw = (p ?? "").trim().replace(/\s+/g, "");
  if (!raw) return "";
  if (raw.startsWith("+")) return raw;
  if (raw.startsWith("33")) return `+${raw}`;
  if (raw.startsWith("0") && raw.length === 10) return `+33${raw.slice(1)}`;
  return raw;
}

async function findRestaurantByTo(to: string) {
  const normalized = normPhone(to);
  const raw = (to ?? "").trim().replace(/\s+/g, "");
  if (normalized) {
    const direct = await prisma.restaurant.findFirst({ where: { twilioNumber: normalized } });
    if (direct) return direct;
  }
  if (raw) {
    const rawMatch = await prisma.restaurant.findFirst({ where: { twilioNumber: raw } });
    if (rawMatch) return rawMatch;
  }
  return null;
}

function buildTwimlVacation(message: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="fr-FR" voice="Polly.Lea">${escapeXml(message)}</Say>
  <Hangup/>
</Response>`;
}

function buildTwimlConfigured(req: Request, greetText: string) {
  const baseUrl = getBaseUrl(req);
  const actionUrl = `${baseUrl}/api/twilio/voice/handle-speech`;
  const redirectUrl = `${baseUrl}/api/twilio/voice/incoming`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="fr-FR" speechTimeout="auto" actionOnEmptyResult="true" action="${actionUrl}" method="POST">
    <Say language="fr-FR" voice="Polly.Lea">${escapeXml(greetText)}</Say>
  </Gather>
  <Say language="fr-FR" voice="Polly.Lea">Je n'ai pas entendu. On recommence.</Say>
  <Redirect method="POST">${redirectUrl}</Redirect>
</Response>`;
}

function buildTwimlNotConfigured() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="fr-FR" voice="Polly.Lea">Ce numéro n'est pas encore configuré. Merci de contacter le restaurant.</Say>
  <Hangup/>
</Response>`;
}

export async function POST(req: Request) {
  const form = await req.formData();
  const to = (form.get("To") ?? "").toString();
  const callSid = (form.get("CallSid") ?? "").toString();

  const restaurant = await findRestaurantByTo(to);
  if (!restaurant) return xml(buildTwimlNotConfigured());

  // Mode vacances — raccroche immédiatement avec le message configuré
  if (restaurant.vacationMode) {
    const msg = restaurant.vacationMessage ?? "Le restaurant est actuellement fermé. Merci de rappeler.";
    return xml(buildTwimlVacation(msg));
  }

  // Message d'accueil : priorité au welcomeMessage personnalisé
  const greet = restaurant.welcomeMessage?.trim()
    ? restaurant.welcomeMessage.trim()
    : restaurant.name
      ? `Bonjour, pizzeria ${restaurant.name}, puis-je prendre votre commande ?`
      : "Bonjour, puis-je prendre votre commande ?";

  if (callSid) {
    await prisma.conversation.upsert({
      where: { externalId: callSid },
      update: {},
      create: {
        externalId: callSid,
        messages: [{ role: "assistant", content: greet }],
      },
    });
  }

  return xml(buildTwimlConfigured(req, greet));
}

export async function GET(req: Request) {
  return xml(buildTwimlConfigured(req, "Bonjour, puis-je prendre votre commande ?"));
}
