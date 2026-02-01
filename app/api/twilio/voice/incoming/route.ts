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

function normPhone(p?: string | null) {
  return (p ?? "").trim().replace(/\s+/g, "");
}

async function findRestaurantByTo(to: string) {
  const twilioNumber = normPhone(to);
  if (!twilioNumber) return null;

  return prisma.restaurant.findFirst({
    where: { twilioNumber },
  });
}

function buildTwiml(req: Request, greetText: string) {
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

export async function POST(req: Request) {
  const form = await req.formData();
  const to = (form.get("To") ?? "").toString();

  const restaurant = await findRestaurantByTo(to);

  const greet = restaurant?.name
    ? `Bonjour, ici ${restaurant.name}. Je vous écoute pour votre commande.`
    : "Bonjour, ici la pizzeria. Je vous écoute pour votre commande.";

  return xml(buildTwiml(req, greet));
}

// GET (debug browser)
export async function GET(req: Request) {
  return xml(buildTwiml(req, "Bonjour, ici la pizzeria. Je vous écoute pour votre commande."));
}
