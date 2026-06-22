import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../../../../lib/prisma";
import { buildSystemPrompt } from "../../../../ai/systemPrompt.voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function xml(body: string) {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function getBaseUrl(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}

function escapeXml(s: string) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function say(text: string) {
  return `<Say language="fr-FR" voice="Polly.Lea">${escapeXml(text)}</Say>`;
}

function gatherSay(baseUrl: string, text: string) {
  const action = `${baseUrl}/api/twilio/voice/handle-speech`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="fr-FR" speechTimeout="auto" actionOnEmptyResult="true" action="${action}" method="POST">
    ${say(text)}
  </Gather>
  ${say("Je n'ai pas entendu. Répétez s'il vous plaît.")}
  <Redirect method="POST">${action}</Redirect>
</Response>`;
}

function hangupTwiml(text: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${say(text)}
  <Hangup/>
</Response>`;
}

function normPhone(p?: string | null) {
  const raw = (p ?? "").trim().replace(/\s+/g, "");
  if (!raw) return "";
  if (raw.startsWith("+")) return raw;
  if (raw.startsWith("33")) return `+${raw}`;
  if (raw.startsWith("0") && raw.length === 10) return `+33${raw.slice(1)}`;
  return raw;
}

async function resolveRestaurant(to?: string | null) {
  const normalized = normPhone(to);
  const raw = (to ?? "").trim().replace(/\s+/g, "");
  if (normalized) {
    const r = await prisma.restaurant.findFirst({ where: { twilioNumber: normalized } });
    if (r) return r;
  }
  if (raw) {
    const r = await prisma.restaurant.findFirst({ where: { twilioNumber: raw } });
    if (r) return r;
  }
  return null;
}

type Message = { role: "user" | "assistant"; content: string };

async function loadHistory(callSid: string): Promise<Message[]> {
  const conv = await prisma.conversation.findUnique({ where: { externalId: callSid } });
  if (!conv?.messages) return [];
  const msgs = conv.messages as Message[];
  return Array.isArray(msgs) ? msgs : [];
}

async function saveHistory(callSid: string, messages: Message[]) {
  await prisma.conversation.upsert({
    where: { externalId: callSid },
    update: { messages },
    create: { externalId: callSid, messages },
  });
}

function extractOrderJson(text: string): Record<string, unknown> | null {
  const match = text.match(/<COMMANDE_PRETE>\s*([\s\S]*?)\s*<\/COMMANDE_PRETE>/);
  if (!match?.[1]) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

function stripOrderBlock(text: string) {
  return text.replace(/<COMMANDE_PRETE>[\s\S]*?<\/COMMANDE_PRETE>/g, "").trim();
}

async function saveOrder(callSid: string, restaurantId: string, data: Record<string, unknown>) {
  type Item = { name?: string; qty?: number; note?: string };
  const items = Array.isArray(data.items) ? (data.items as Item[]) : [];
  const product = items.map(it => `${it.qty ?? 1}x ${it.name ?? "?"}${it.note ? ` (${it.note})` : ""}`).join(", ");
  await prisma.order.upsert({
    where: { clientOrderId: callSid },
    update: { type: String(data.type ?? "takeaway"), customerName: String(data.customerName ?? ""), phone: String(data.phone ?? ""), address: String(data.address ?? ""), product, extras: JSON.stringify(items), total: Number(data.total ?? 0), status: "confirmed", restaurantId },
    create: { clientOrderId: callSid, type: String(data.type ?? "takeaway"), customerName: String(data.customerName ?? ""), phone: String(data.phone ?? ""), address: String(data.address ?? ""), product, extras: JSON.stringify(items), total: Number(data.total ?? 0), status: "confirmed", restaurantId },
  });
}

export async function POST(req: NextRequest) {
  const baseUrl = getBaseUrl(req);
  try {
    const form = await req.formData();
    const speech = ((form.get("SpeechResult") ?? "") as string).trim();
    const callSid = ((form.get("CallSid") ?? "") as string).toString();
    const to = ((form.get("To") ?? "") as string).toString();

    const restaurant = await resolveRestaurant(to);
    if (!restaurant) return xml(hangupTwiml("Ce numéro n'est pas encore configuré."));

    // Charger le menu réel depuis la base
    const menuItems = await prisma.menuItem.findMany({
      where: { restaurantId: restaurant.id },
      orderBy: { category: "asc" },
    });

    // Charger les suppléments depuis la base
    const supplements = await prisma.supplement.findMany({
      where: { restaurantId: restaurant.id },
      orderBy: { name: "asc" },
    });

    // Construire le menu par catégorie
    const menu: Record<string, { name: string; price: number; description?: string | null; available: boolean }[]> = {};
    for (const item of menuItems) {
      if (!menu[item.category]) menu[item.category] = [];
      menu[item.category].push({ name: item.name, price: item.price, description: item.description, available: item.available });
    }


    if (menuItems.length === 0) {
      return xml(hangupTwiml("Bonjour, notre système de commande n'est pas encore configuré. Merci de nous appeler directement."));
    }
    const history = await loadHistory(callSid);
    history.push({ role: "user", content: speech || "[silence]" });

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: buildSystemPrompt(
        restaurant.name,
        menu,
        supplements.map(s => ({ name: s.name, price: s.price, available: s.available })),
        {
          estimatedPrepTime: restaurant.estimatedPrepTime,
          deliveryEnabled: restaurant.deliveryEnabled,
          deliveryFee: restaurant.deliveryFee,
          deliveryMinimum: restaurant.deliveryMinimum,
          paymentMethods: restaurant.paymentMethods,
          allergensInfo: restaurant.allergensInfo,
          currentPromos: restaurant.currentPromos,
          welcomeMessage: restaurant.welcomeMessage,
          vacationMode: restaurant.vacationMode,
          vacationMessage: restaurant.vacationMessage,
        }
      ),
      messages: history,
    });

    const claudeText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map(b => b.text)
      .join("");

    history.push({ role: "assistant", content: claudeText });
    await saveHistory(callSid, history);

    const orderData = extractOrderJson(claudeText);
    if (orderData) {
      await saveOrder(callSid, restaurant.id, orderData);
      const confirmText = stripOrderBlock(claudeText) || "Votre commande est bien enregistrée. Merci et à bientôt !";
      return xml(hangupTwiml(confirmText));
    }

    return xml(gatherSay(baseUrl, claudeText));
  } catch (err) {
    console.error("handle-speech error:", err);
    return xml(hangupTwiml("Une erreur est survenue. Merci de rappeler."));
  }
}
