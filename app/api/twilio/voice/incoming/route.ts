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
  // ⚠️ garde bien audio.mp3 si tu l’as créé
  return `${baseUrl}/api/tts/audio.mp3?text=${encodeURIComponent(text)}`;
}

function buildTwiml(req: Request) {
  const baseUrl = getBaseUrl(req);
  const actionUrl = `${baseUrl}/api/twilio/voice/handle-speech?step=listen`;
  const redirectUrl = `${baseUrl}/api/twilio/voice/incoming`;

  const greet = "Bonjour, ici la pizzeria. Je vous écoute pour votre commande.";

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
    <Play>${ttsUrl(baseUrl, greet)}</Play>
  </Gather>

  <Play>${ttsUrl(baseUrl, "Je n’ai pas entendu. On recommence.")}</Play>
  <Redirect method="POST">${redirectUrl}</Redirect>
</Response>`;
}

export async function POST(req: Request) {
  return xml(buildTwiml(req));
}

export async function GET(req: Request) {
  return xml(buildTwiml(req));
}
