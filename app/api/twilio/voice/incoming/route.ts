import { NextResponse } from "next/server";

export const runtime = "nodejs";

function xml(body: string) {
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

function getBaseUrl(req: Request) {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  if (!host) return "";
  return `${proto}://${host}`;
}

function ttsUrl(baseUrl: string, text: string) {
  return `${baseUrl}/api/tts?text=${encodeURIComponent(text)}`;
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
