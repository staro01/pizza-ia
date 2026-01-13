import { NextResponse } from "next/server";

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

function buildTwiml(req: Request) {
  const baseUrl = getBaseUrl(req);

  // Ici c’est normal de renvoyer vers incoming pour boucler
  const redirectUrl = `${baseUrl}/api/twilio/voice/incoming`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="fr-FR" voice="alice">Merci !</Say>
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
