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
 * Si tu as en base 0948... on tente de convertir.
 */
function normPhone(p?: string | null) {
  const raw = (p ?? "").trim().replace(/\s+/g, "");
  if (!raw) return "";

  // Déjà en E.164
  if (raw.startsWith("+")) return raw;

  // "33xxxxxxxxx" -> "+33xxxxxxxxx"
  if (raw.startsWith("33")) return `+${raw}`;

  // "0XXXXXXXXX" (FR 10 chiffres) -> "+33XXXXXXXXX"
  if (raw.startsWith("0") && raw.length === 10) return `+33${raw.slice(1)}`;

  return raw;
}

async function findRestaurantByTo(to: string) {
  const twilioNumber = normPhone(to);
  if (!twilioNumber) return null;

  // On tente match direct
  const direct = await prisma.restaurant.findFirst({
    where: { twilioNumber },
  });
  if (direct) return direct;

  // On tente aussi match sur l'autre format (au cas où tu as stocké "09..." en base)
  const raw = (to ?? "").trim().replace(/\s+/g, "");
  if (!raw) return null;

  return prisma.restaurant.findFirst({
    where: { twilioNumber: raw },
  });
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

  // ✅ Étape 1: si pas de restaurant trouvé => on refuse
  if (!restaurant) {
    return xml(buildTwimlNotConfigured(req));
  }

  const greet = restaurant?.name
    ? `Bonjour, ici ${restaurant.name}. Je vous écoute pour votre commande.`
    : "Bonjour, ici la pizzeria. Je vous écoute pour votre commande.";

  return xml(buildTwimlConfigured(req, greet));
}

// GET (debug browser)
export async function GET(req: Request) {
  // En debug navigateur, on affiche juste un message neutre.
  // Ici on ne peut pas connaître "To" car pas de POST Twilio.
  return xml(buildTwimlConfigured(req, "Bonjour, ici la pizzeria. Je vous écoute pour votre commande."));
}
