import { NextRequest } from "next/server";
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

function getBaseUrl(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}

function ttsUrl(baseUrl: string, text: string) {
  return `${baseUrl}/api/tts/audio.ulaw?text=${encodeURIComponent(text)}`;
}

function normPhone(p?: string | null) {
  const raw = (p ?? "").trim().replace(/\s+/g, "");
  if (!raw) return "";

  if (raw.startsWith("+")) return raw;
  if (raw.startsWith("33")) return `+${raw}`;
  if (raw.startsWith("0") && raw.length === 10) return `+33${raw.slice(1)}`;

  return raw;
}

async function resolveRestaurantId(to?: string | null) {
  const normalized = normPhone(to);
  const raw = (to ?? "").trim().replace(/\s+/g, "");

  if (normalized) {
    const mapped = await prisma.restaurant.findFirst({
      where: { twilioNumber: normalized },
      select: { id: true },
    });
    if (mapped?.id) return mapped.id;
  }

  if (raw) {
    const mappedRaw = await prisma.restaurant.findFirst({
      where: { twilioNumber: raw },
      select: { id: true },
    });
    if (mappedRaw?.id) return mappedRaw.id;
  }

  return null;
}

/** ========= MENU TEST (à améliorer ensemble ensuite) ========= */
const PIZZAS = [
  { key: "margherita", label: "Margherita", price: 10, ingredients: ["tomate", "mozzarella", "basilic"] },
  { key: "reine", label: "Reine", price: 11, ingredients: ["tomate", "mozzarella", "jambon", "champignons"] },
  { key: "pepperoni", label: "Pepperoni", price: 12, ingredients: ["tomate", "mozzarella", "pepperoni"] },
];

const DRINKS = [
  { key: "coca", label: "Coca", price: 3 },
  { key: "eau", label: "Eau", price: 2 },
  { key: "ice tea", label: "Ice Tea", price: 3 },
];

const DESSERTS = [
  { key: "tiramisu", label: "Tiramisu", price: 5 },
  { key: "brownie", label: "Brownie", price: 4 },
  { key: "glace", label: "Glace", price: 4 },
];

const TOPPINGS = [
  { key: "fromage", label: "Fromage", price: 2 },
  { key: "olives", label: "Olives", price: 1 },
  { key: "champignons", label: "Champignons", price: 1.5 },
];

/** ========= Helpers texte ========= */
function norm(s: string) {
  return (s ?? "").toLowerCase().trim();
}

function isYes(s: string) {
  const t = norm(s);
  return t === "oui" || t.includes("oui") || t.includes("ok") || t.includes("d'accord") || t.includes("parfait");
}

function isNo(s: string) {
  const t = norm(s);
  return t === "non" || t.includes("non");
}

function wantsMenu(s: string) {
  const t = norm(s);
  return (
    t.includes("menu") ||
    t.includes("carte") ||
    t.includes("vous avez quoi") ||
    t.includes("qu'est ce que vous avez") ||
    t.includes("quelles pizzas") ||
    t.includes("quels desserts") ||
    t.includes("quelles boissons")
  );
}

function menuSentence() {
  const pizzas = PIZZAS.map((p) => `${p.label} à ${p.price} euros`).join(", ");
  const drinks = DRINKS.map((d) => `${d.label} à ${d.price} euros`).join(", ");
  const desserts = DESSERTS.map((d) => `${d.label} à ${d.price} euros`).join(", ");
  const toppings = TOPPINGS.map((t) => `${t.label} +${t.price} euros`).join(", ");

  return `Voici le menu. Pizzas : ${pizzas}. Boissons : ${drinks}. Desserts : ${desserts}. Suppléments possibles : ${toppings}. Dites-moi ce que vous voulez commander.`;
}

/** ========= Quantités : plus tolérant ========= */
function detectQty(s: string) {
  const t = norm(s);

  const m = t.match(/\b([1-9])\b/);
  if (m) return Number(m[1]);

  if (t.includes("une") || t.includes("un ")) return 1;
  if (t.includes("deux")) return 2;
  if (t.includes("trois")) return 3;
  if (t.includes("quatre")) return 4;

  return 1;
}

/** ========= Cart types ========= */
type Kind = "pizza" | "drink" | "dessert";

type CartItem = {
  kind: Kind;
  name: string;
  qty: number;
  additions?: string[];
  removals?: string[];
  unitPrice: number;
};

type Cart = {
  items: CartItem[];
  askedExtras?: boolean;
};

function safeParseCart(raw: string | null | undefined): Cart {
  if (!raw) return { items: [] };
  const txt = raw.trim();
  if (!txt) return { items: [] };
  try {
    const data = JSON.parse(txt);
    if (data && Array.isArray(data.items)) return data;
    return { items: [] };
  } catch {
    return { items: [] };
  }
}

function cartTotal(cart: Cart) {
  return cart.items.reduce((sum, it) => sum + it.unitPrice * it.qty, 0);
}

/** ========= Détection items (tolérant : label OU key) ========= */
function findPizzaInText(s: string) {
  const t = norm(s);
  return PIZZAS.find((p) => t.includes(p.key) || t.includes(norm(p.label))) ?? null;
}
function findDrinkInText(s: string) {
  const t = norm(s);
  return DRINKS.find((d) => t.includes(d.key) || t.includes(norm(d.label))) ?? null;
}
function findDessertInText(s: string) {
  const t = norm(s);
  return DESSERTS.find((d) => t.includes(d.key) || t.includes(norm(d.label))) ?? null;
}

/** ========= Suppléments / sans ========= */
function detectToppingsAdd(s: string) {
  const t = norm(s);
  const adds: string[] = [];
  for (const top of TOPPINGS) {
    if (t.includes(top.key) || t.includes(norm(top.label))) adds.push(top.label);
  }
  return Array.from(new Set(adds));
}

/**
 * "sans champignons", "sans oignons", etc.
 * On prend ce qui suit "sans" jusqu'à une pause.
 */
function detectRemovals(s: string) {
  const t = norm(s);
  const idx = t.indexOf("sans ");
  if (idx === -1) return [];

  const after = t.slice(idx + 5);
  const cut = after
    .split(" et ")[0]
    .split(",")[0]
    .split(".")[0]
    .trim();

  if (!cut) return [];

  const words = cut.split(" ").filter(Boolean).slice(0, 3);
  if (words.length === 0) return [];

  return [words.join(" ")];
}

/** ========= Découper une phrase en plusieurs segments =========
 * Ex: "une reine sans champignons et un coca et un tiramisu"
 */
function splitSegments(s: string) {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return [];
  return t
    .split(/(?:,|;|\bet\b)/i)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** ========= Parsing "naturel" =========
 * On essaie de comprendre d'un coup, sans script.
 */
function parseUtteranceToItems(s: string): CartItem[] {
  const segments = splitSegments(s);
  const items: CartItem[] = [];

  // Si la phrase n'a pas "et", on traite comme un seul segment
  const segs = segments.length ? segments : [s];

  for (const seg of segs) {
    const qty = detectQty(seg);

    const pizza = findPizzaInText(seg);
    const drink = findDrinkInText(seg);
    const dessert = findDessertInText(seg);

    if (pizza) {
      const adds = detectToppingsAdd(seg);
      const rems = detectRemovals(seg);

      const addPrice = adds.reduce(
        (sum, a) => sum + (TOPPINGS.find((x) => x.label === a)?.price ?? 0),
        0
      );

      items.push({
        kind: "pizza",
        name: pizza.label,
        qty,
        additions: adds.length ? adds : undefined,
        removals: rems.length ? rems : undefined,
        unitPrice: pizza.price + addPrice,
      });
      continue;
    }

    if (drink) {
      items.push({
        kind: "drink",
        name: drink.label,
        qty,
        unitPrice: drink.price,
      });
      continue;
    }

    if (dessert) {
      items.push({
        kind: "dessert",
        name: dessert.label,
        qty,
        unitPrice: dessert.price,
      });
      continue;
    }
  }

  return items;
}

/** ========= Récap ========= */
function itemSentence(it: CartItem) {
  const kindLabel = it.kind === "pizza" ? "pizza" : it.kind === "drink" ? "boisson" : "dessert";
  const base = `${it.qty} ${kindLabel}${it.qty > 1 ? "s" : ""} ${it.name}`;
  const adds = it.additions?.length ? ` avec ${it.additions.join(", ")}` : "";
  const rems = it.removals?.length ? ` sans ${it.removals.join(", ")}` : "";
  return `${base}${adds}${rems}`;
}

function recapSentence(cart: Cart) {
  if (cart.items.length === 0) return "Je n’ai rien noté. Dites-moi ce que vous souhaitez commander.";
  const lines = cart.items.map(itemSentence).join(", ");
  const total = cartTotal(cart);
  return `Je récapitule : ${lines}. Total ${total} euros. Vous confirmez ?`;
}

/** ========= Intention "fin" ========= */
function isDone(s: string) {
  const t = norm(s);
  return (
    t.includes("c'est tout") ||
    t.includes("ce sera tout") ||
    t.includes("c’est tout") ||
    t.includes("rien d'autre") ||
    t.includes("rien d’autre") ||
    t.includes("terminé") ||
    t.includes("fini")
  );
}
function wantsChange(s: string) {
  const t = norm(s);
  return t.includes("changer") || t.includes("modifie") || t.includes("finalement") || t.includes("en fait");
}

/** ========= TwiML gather ========= */
function gatherPlay(baseUrl: string, step: string, text: string) {
  const action = `${baseUrl}/api/twilio/voice/handle-speech?step=${step}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather
    input="speech"
    language="fr-FR"
    speechTimeout="auto"
    actionOnEmptyResult="true"
    action="${action}"
    method="POST"
  >
    <Play>${ttsUrl(baseUrl, text)}</Play>
  </Gather>

  <Play>${ttsUrl(baseUrl, "Je n’ai pas entendu. Répétez s’il vous plaît.")}</Play>
  <Redirect method="POST">${action}</Redirect>
</Response>`;
}

function notConfiguredTwiml(baseUrl: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${ttsUrl(baseUrl, "Ce numéro n’est pas encore configuré. Merci de contacter le restaurant.")}</Play>
  <Hangup/>
</Response>`;
}

function hangupTwiml(baseUrl: string, text: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${ttsUrl(baseUrl, text)}</Play>
  <Hangup/>
</Response>`;
}

/** ========= Adresse : on demande d'abord COMPLET ========= */
function looksLikeHasNumber(s: string) {
  return /\d/.test(s);
}
function looksLikeEnoughWords(s: string) {
  return (s ?? "").trim().split(/\s+/).length >= 3;
}

export async function POST(req: NextRequest) {
  const baseUrl = getBaseUrl(req);
  const redirectIncoming = `${baseUrl}/api/twilio/voice/incoming`;

  try {
    const url = new URL(req.url);
    const step = url.searchParams.get("step") ?? "listen";

    const form = await req.formData();
    const speech = (form.get("SpeechResult") ?? "").toString();
    const callSid = (form.get("CallSid") ?? "").toString();
    const to = (form.get("To") ?? "").toString();

    const restaurantId = await resolveRestaurantId(to);
    if (!restaurantId) return xml(notConfiguredTwiml(baseUrl));

    async function getOrCreateOrder() {
      const createData = {
        clientOrderId: callSid || null,
        status: "draft",
        type: "takeaway",
        product: "",
        size: "",
        extras: JSON.stringify({ items: [] } satisfies Cart),
        total: 0,
        restaurantId,
      };

      if (!callSid) return prisma.order.create({ data: createData });

      return prisma.order.upsert({
        where: { clientOrderId: callSid },
        update: {},
        create: createData,
      });
    }

    async function loadCart(orderId: string) {
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      const cart = safeParseCart(order?.extras);
      return { order, cart };
    }

    async function saveCart(orderId: string, cart: Cart) {
      const total = cartTotal(cart);
      await prisma.order.update({
        where: { id: orderId },
        data: {
          extras: JSON.stringify(cart),
          total,
        },
      });
    }

    /** ======== ETAPE PRINCIPALE : plus naturelle ======== */
    if (step === "listen") {
      const order = await getOrCreateOrder();
      const { cart } = await loadCart(order.id);

      const txt = speech.trim();

      if (!txt) {
        return xml(
          gatherPlay(
            baseUrl,
            "listen",
            "Dites-moi ce que vous voulez commander. Vous pouvez dire par exemple : une Reine sans champignons, avec fromage."
          )
        );
      }

      if (wantsMenu(txt)) {
        return xml(gatherPlay(baseUrl, "listen", menuSentence()));
      }

      // ✅ Nouveau : on parse la phrase en items directement
      const parsedItems = parseUtteranceToItems(txt);

      if (parsedItems.length > 0) {
        cart.items.push(...parsedItems);
        await saveCart(order.id, cart);

        // Si la phrase contient déjà "c'est tout", on enchaîne direct vers récap
        if (isDone(txt)) {
          return xml(gatherPlay(baseUrl, "recap", recapSentence(cart)));
        }

        return xml(gatherPlay(baseUrl, "more", "Très bien. Souhaitez-vous autre chose ?"));
      }

      // Si le client dit "c'est tout" mais rien dans le panier
      if (isDone(txt) && cart.items.length === 0) {
        return xml(gatherPlay(baseUrl, "listen", "D’accord. Qu’est-ce que vous souhaitez commander ?"));
      }

      // On n'a pas compris : on donne un exemple simple
      return xml(
        gatherPlay(
          baseUrl,
          "listen",
          "Je n’ai pas compris. Dites par exemple : une Margherita, ou une Reine sans champignons, ou un Coca. Si vous voulez, je peux aussi vous lire le menu."
        )
      );
    }

    /** ======== Autre chose ? ======== */
    if (step === "more") {
      const order = await getOrCreateOrder();
      const { cart } = await loadCart(order.id);

      const txt = speech.trim();

      if (!txt) return xml(gatherPlay(baseUrl, "more", "Souhaitez-vous autre chose ?"));

      // Si la personne dit un produit direct, on l’ajoute sans forcer un script
      const parsedItems = parseUtteranceToItems(txt);
      if (parsedItems.length > 0) {
        cart.items.push(...parsedItems);
        await saveCart(order.id, cart);
        return xml(gatherPlay(baseUrl, "more", "Très bien. Souhaitez-vous autre chose ?"));
      }

      if (isYes(txt)) {
        return xml(gatherPlay(baseUrl, "listen", "D’accord. Dites-moi ce que vous voulez ajouter."));
      }

      if (isNo(txt) || isDone(txt)) {
        // petite relance boissons/desserts si pas encore fait
        if (!cart.askedExtras) {
          cart.askedExtras = true;
          await saveCart(order.id, cart);
          return xml(gatherPlay(baseUrl, "extras", "Souhaitez-vous une boisson ou un dessert ?"));
        }

        return xml(gatherPlay(baseUrl, "recap", recapSentence(cart)));
      }

      return xml(gatherPlay(baseUrl, "more", "D’accord. Souhaitez-vous autre chose ?"));
    }

    /** ======== Boissons / desserts ======== */
    if (step === "extras") {
      const order = await getOrCreateOrder();
      const { cart } = await loadCart(order.id);

      const txt = speech.trim();
      if (!txt) return xml(gatherPlay(baseUrl, "extras", "Souhaitez-vous une boisson ou un dessert ?"));

      if (isNo(txt) || isDone(txt)) {
        return xml(gatherPlay(baseUrl, "recap", recapSentence(cart)));
      }

      // si le client répond directement par un produit
      const parsedItems = parseUtteranceToItems(txt);
      if (parsedItems.length > 0) {
        cart.items.push(...parsedItems);
        await saveCart(order.id, cart);
        return xml(gatherPlay(baseUrl, "more", "Très bien. Souhaitez-vous autre chose ?"));
      }

      // si oui mais pas clair, on suggère
      if (isYes(txt)) {
        return xml(
          gatherPlay(
            baseUrl,
            "listen",
            `Vous pouvez dire par exemple : ${DRINKS[0].label}, ${DRINKS[1].label}, ou ${DESSERTS[0].label}.`
          )
        );
      }

      return xml(gatherPlay(baseUrl, "listen", "D’accord. Dites-moi ce que vous souhaitez prendre."));
    }

    /** ======== Récap + modifications ======== */
    if (step === "recap") {
      const order = await getOrCreateOrder();
      const { cart } = await loadCart(order.id);

      const txt = speech.trim();
      if (!txt) return xml(gatherPlay(baseUrl, "recap", recapSentence(cart)));

      if (isYes(txt)) {
        return xml(gatherPlay(baseUrl, "type", "Parfait. C’est en livraison ou à emporter ?"));
      }

      if (isNo(txt) || wantsChange(txt)) {
        return xml(
          gatherPlay(
            baseUrl,
            "edit",
            "D’accord. Dites-moi la modification. Par exemple : enlève le Coca, ou ajoute une Reine, ou une Reine sans champignons."
          )
        );
      }

      return xml(gatherPlay(baseUrl, "recap", "Dites oui pour confirmer, ou dites ce que vous voulez modifier."));
    }

    /** ======== Edit simple (add/remove) ======== */
    if (step === "edit") {
      const order = await getOrCreateOrder();
      const { cart } = await loadCart(order.id);

      const txt = speech.trim();
      const t = norm(txt);

      if (!t) return xml(gatherPlay(baseUrl, "edit", "Dites-moi ce que vous voulez changer."));

      // Retirer
      if (t.includes("enlève") || t.includes("retire") || t.includes("annule") || t.includes("supprime")) {
        const pizza = findPizzaInText(t);
        const drink = findDrinkInText(t);
        const dessert = findDessertInText(t);
        const targetName = pizza?.label || drink?.label || dessert?.label || "";

        if (targetName) {
          const idx = cart.items.findIndex((it) => norm(it.name) === norm(targetName));
          if (idx !== -1) {
            cart.items.splice(idx, 1);
            await saveCart(order.id, cart);
            return xml(gatherPlay(baseUrl, "recap", `Ok, j’enlève ${targetName}. ${recapSentence(cart)}`));
          }
          return xml(gatherPlay(baseUrl, "edit", `Je ne vois pas ${targetName} dans la commande. Dites-moi ce que vous voulez enlever.`));
        }

        // sinon : enlever le dernier
        if (cart.items.length > 0) {
          const removed = cart.items.pop()!;
          await saveCart(order.id, cart);
          return xml(gatherPlay(baseUrl, "recap", `Ok, j’enlève ${removed.name}. ${recapSentence(cart)}`));
        }

        return xml(gatherPlay(baseUrl, "edit", "Il n’y a rien à enlever. Dites-moi ce que vous voulez ajouter."));
      }

      // Ajouter via parsing
      const parsed = parseUtteranceToItems(txt);
      if (parsed.length > 0) {
        cart.items.push(...parsed);
        await saveCart(order.id, cart);
        return xml(gatherPlay(baseUrl, "recap", `Ok. ${recapSentence(cart)}`));
      }

      // Modifier "sans" / "avec" sur la dernière pizza si possible
      const removals = detectRemovals(txt);
      const adds = detectToppingsAdd(txt);

      if (removals.length || adds.length) {
        // dernière pizza
        for (let i = cart.items.length - 1; i >= 0; i--) {
          const it = cart.items[i];
          if (it.kind !== "pizza") continue;

          it.removals = Array.from(new Set([...(it.removals ?? []), ...removals]));
          it.additions = Array.from(new Set([...(it.additions ?? []), ...adds]));

          const basePrice = PIZZAS.find((p) => p.label === it.name)?.price ?? it.unitPrice;
          const addPrice = (it.additions ?? []).reduce(
            (sum, a) => sum + (TOPPINGS.find((x) => x.label === a)?.price ?? 0),
            0
          );
          it.unitPrice = basePrice + addPrice;

          await saveCart(order.id, cart);
          return xml(gatherPlay(baseUrl, "recap", `D’accord. ${recapSentence(cart)}`));
        }

        return xml(gatherPlay(baseUrl, "edit", "D’accord, mais je ne vois pas de pizza à modifier. Dites-moi ce que vous voulez ajouter."));
      }

      return xml(gatherPlay(baseUrl, "edit", "Je n’ai pas compris. Dites : enlève le Coca, ou ajoute une Reine."));
    }

    /** ======== Livraison / emporter ======== */
    if (step === "type") {
      const order = await getOrCreateOrder();
      const t = norm(speech);

      let type: "delivery" | "takeaway" | null = null;
      if (t.includes("livraison") || t.includes("domicile") || t.includes("livrer")) type = "delivery";
      if (
        t.includes("emporter") ||
        t.includes("à emporter") ||
        t.includes("a emporter") ||
        t.includes("sur place") ||
        t.includes("venir chercher")
      )
        type = "takeaway";

      if (!type) return xml(gatherPlay(baseUrl, "type", "C’est en livraison ou à emporter ?"));

      await prisma.order.update({ where: { id: order.id }, data: { type } });
      return xml(gatherPlay(baseUrl, "name", "Très bien. Quel est votre nom pour la commande ?"));
    }

    /** ======== Nom ======== */
    if (step === "name") {
      const order = await getOrCreateOrder();
      const name = speech.trim();
      if (!name) return xml(gatherPlay(baseUrl, "name", "Quel est votre nom pour la commande ?"));

      await prisma.order.update({ where: { id: order.id }, data: { customerName: name } });
      return xml(gatherPlay(baseUrl, "phone", "Merci. Quel est votre numéro de téléphone ?"));
    }

    /** ======== Téléphone ======== */
    if (step === "phone") {
      const order = await getOrCreateOrder();
      const phone = speech.trim();
      if (!phone) return xml(gatherPlay(baseUrl, "phone", "Quel est votre numéro de téléphone ?"));

      const updated = await prisma.order.update({ where: { id: order.id }, data: { phone } });

      // ✅ Changement demandé : adresse complète d'abord
      if (updated.type === "delivery") {
        return xml(gatherPlay(baseUrl, "addr_full", "Parfait. Quelle est votre adresse complète ?"));
      }

      await prisma.order.update({ where: { id: updated.id }, data: { status: "confirmed" } });
      return xml(
        hangupTwiml(
          baseUrl,
          "C’est noté. Votre commande est bien enregistrée. Vous serez appelé lorsque votre commande sera prête. Merci et à bientôt."
        )
      );
    }

    /** ======== Adresse complète (avec relances si flou) ======== */
    if (step === "addr_full") {
      const order = await getOrCreateOrder();
      const addr = speech.trim();

      if (!addr) return xml(gatherPlay(baseUrl, "addr_full", "Quelle est votre adresse complète ?"));

      // Validation simple : au moins quelques mots + un chiffre (numéro)
      // Si pas bon : on reformule pour aider, sans passer en mode "numéro/rue/ville" direct.
      if (!looksLikeEnoughWords(addr) || !looksLikeHasNumber(addr)) {
        return xml(
          gatherPlay(
            baseUrl,
            "addr_full",
            "Je veux être sûr de bien noter. Pouvez-vous me redire l’adresse complète, avec le numéro, la rue et la ville ?"
          )
        );
      }

      await prisma.order.update({
        where: { id: order.id },
        data: {
          address: addr,
          status: "confirmed",
        },
      });

      return xml(
        hangupTwiml(
          baseUrl,
          "C’est noté. Votre commande est bien enregistrée et elle est en cours de livraison. Merci et à bientôt."
        )
      );
    }

    /** fallback */
    return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">${redirectIncoming}</Redirect>
</Response>`);
  } catch (err) {
    console.error("handle-speech error:", err);
    const baseUrl = getBaseUrl(req);
    return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${ttsUrl(baseUrl, "Une erreur est survenue. Merci de rappeler.")}</Play>
  <Hangup/>
</Response>`);
  }
}
