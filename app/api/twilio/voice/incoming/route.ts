import { NextResponse } from "next/server";

function xml(body: string) {
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

function getBaseUrl(req: Request) {
  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  if (!host) return "";
  return `${proto}://${host}`;
}

function buildTwiml(req: Request) {
  const baseUrl = getBaseUrl(req);
  const actionUrl = `${baseUrl}/api/twilio/voice/handle-speech`;
  const redirectUrl = `${baseUrl}/api/twilio/voice/incoming`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="fr-FR" speechTimeout="auto" action="${actionUrl}" method="POST">
    <Say language="fr-FR" voice="alice">Bonjour ! C’est la pizzeria. C’est pour une livraison ou à emporter ?</Say>
  </Gather>

  <Say language="fr-FR" voice="alice">Je n’ai pas entendu. On recommence.</Say>
  <Redirect method="POST">${redirectUrl}</Redirect>
</Response>`;
}

export async function POST(req: Request) {
  return xml(buildTwiml(req));
}

// utile pour tester dans le navigateur
export async function GET(req: Request) {
  return xml(buildTwiml(req));
}
