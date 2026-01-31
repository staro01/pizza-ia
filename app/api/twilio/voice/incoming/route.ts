import { NextResponse } from "next/server";

export const runtime = "nodejs";

function xml(body: string) {
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

function getBaseUrl(req: Request) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}

function ttsUrl(baseUrl: string, text: string) {
  return `${baseUrl}/api/tts/audio?text=${encodeURIComponent(text)}`;
}

function buildTwiml(req: Request) {
  const baseUrl = getBaseUrl(req);
  const actionUrl = `${baseUrl}/api/twilio/voice/handle-speech?step=listen`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${ttsUrl(baseUrl, "Bonjour, ici la pizzeria. Je vous écoute pour votre commande.")}</Play>

  <Gather
    input="speech"
    language="fr-FR"
    speechTimeout="auto"
    action="${actionUrl}"
    method="POST"
  />
</Response>`;
}

export async function POST(req: Request) {
  return xml(buildTwiml(req));
}

export async function GET(req: Request) {
  return xml(buildTwiml(req));
}
