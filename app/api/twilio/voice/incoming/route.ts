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

function getBaseUrl(req: Request) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}

function ttsUrl(baseUrl: string, text: string) {
  return `${baseUrl}/api/tts/audio.ulaw?text=${encodeURIComponent(text)}`;
}

/**
 * Normalisation simple pour éviter les bugs de format.
 * Twilio envoie souvent du E.164: +339...
 */
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

function buildTwimlConfigured(req: Request, greetText: string) {
  const baseUrl = getBaseUrl(req);
  const actionUrl = `${baseUrl}/api/twilio/voice/handle-speech?step=listen`;
  const redirectUrl = `${baseUrl}/api/twilio/voice/incoming`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather
    input="speech"
    language="fr-FR"
    speechTimeout="auto"
    actionOnEmptyResult="true"
    action="${actionUrl}"
    method="POST"
  >
    <Play>${ttsUrl(baseUrl, greetText)}</Play>
  </Gather>

  <Play>${ttsUrl(baseUrl, "Je n’ai pas entendu. On recommence.")}</Play>
  <Redirect method="POST">${redirectUrl}</Redirect>
</Response>`;
}

function buildTwimlNotConfigured(req: Request) {
  const baseUrl = getBaseUrl(req);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${ttsUrl(baseUrl, "Ce numéro n’est pas encore configuré. Merci de contacter le restaurant.")}</Play>
  <Hangup/>
</Response>`;
}

export async function POST(req: Request) {
  const form = await req.formData();
  const to = (form.get("To") ?? "").toString();

  const restaurant = await findRestaurantByTo(to);

  if (!restaurant) {
    return xml(buildTwimlNotConfigured(req));
  }

  // ✅ Nouveau greeting demandé
  const greet = restaurant?.name
    ? `Bonjour, pizzeria ${restaurant.name}. Puis-je prendre votre commande ?`
    : "Bonjour, pizzeria. Puis-je prendre votre commande ?";

  return xml(buildTwimlConfigured(req, greet));
}

// GET (debug browser)
export async function GET(req: Request) {
  return xml(buildTwimlConfigured(req, "Bonjour, pizzeria. Puis-je prendre votre commande ?"));
}
