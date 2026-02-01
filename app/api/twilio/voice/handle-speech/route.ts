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

function includesAny(text: string, words: string[]) {
  const t = norm(text);
  return words.some((w) => t.includes(w));
}

function isYes(s: string) {
  const t = norm(s);
  return t === "oui" || t.includes("oui") || t.includes("ok") || t.includes("d'accord") || t.includes("parfait");
}

function isNo(s: string) {
  const t = norm(s);
  return t === "non" || t.includes("non");
}

/** ========= Détection demande menu ========= */
function wantsMenu(s: string) {
  const t = norm(s);
  return (
    t.includes("menu") ||
    t.includes("carte") ||
    t.includes("qu'est ce que vous avez") ||
    t.includes("vous avez quoi") ||
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

/** ========= Quantités simples ========= */
function detectQty(s: string) {
  const t = norm(s);

  // chiffre direct
  const m = t.match(/\b([1-9])\b/);
  if (m) return Number(m[1]);

  // mots simples
  if (t.includes("une") || t.includes("un ")) return 1;
  if (t.includes("deux")) return 2;
  if (t.includes("trois")) return 3;
  if (t.includes("quatre")) return 4;

  return 1;
}

/** ========= Détection items ========= */
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
  askedExtras?: boolean; // a-t-on déjà demandé boissons/desserts ?
  lastPrompt?: string;
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

function findPizza(s: string) {
  const t = norm(s);
  return PIZZAS.find((p) => t.includes(p.key) || t.includes(norm(p.label))) ?? null;
}

function findDrink(s: string) {
  const t = norm(s);
  return DRINKS.find((d) => t.includes(d.key) || t.includes(norm(d.label))) ?? null;
}

function findDessert(s: string) {
  const t = norm(s);
  return DESSERTS.find((d) => t.includes(d.key) || t.includes(norm(d.label))) ?? null;
}

function detectToppingsAdd(s: string) {
  const t = norm(s);
  const adds: string[] = [];
  for (const top of TOPPINGS) {
    if (t.includes(top.key) || t.includes(norm(top.label))) adds.push(top.label);
  }
  return adds;
}

/**
 * Détection "sans ..." très simple.
 * Exemple: "une reine sans champignons" -> removals:["champignons"]
 */
function detectRemovals(s: string) {
  const t = norm(s);
  const idx = t.indexOf("sans ");
  if (idx === -1) return [];

  const after = t.slice(idx + 5);
  // on coupe si le client enchaîne avec autre chose
  const cut = after.split(" et ")[0].split(",")[0].trim();
  if (!cut) return [];

  // on garde 1-2 mots max pour rester simple
  const words = cut.split(" ").filter(Boolean).slice(0, 2);
  if (words.length === 0) return [];

  return [words.join(" ")];
}

function isDone(s: string) {
  return includesAny(s, [
    "c'est tout",
    "ce sera tout",
    "c’est tout",
    "c est tout",
    "terminé",
    "fini",
    "non merci",
    "rien d'autre",
    "rien d’autre",
  ]);
}

function wantsMore(s: string) {
  return includesAny(s, ["oui", "encore", "ajoute", "je veux aussi", "et aussi", "et puis"]);
}

function wantsChange(s: string) {
  return includesAny(s, ["changer", "modifie", "modification", "en fait", "finalement", "remplace", "annule", "retire"]);
}

/** ========= Récap ========= */
function itemSentence(it: CartItem) {
  const base = `${it.qty} ${it.kind === "pizza" ? "pizza" : it.kind}${it.qty > 1 ? "s" : ""} ${it.name}`;
  const adds = it.additions?.length ? ` avec ${it.additions.join(", ")}` : "";
  const rems = it.removals?.length ? ` sans ${it.removals.join(", ")}` : "";
  return `${base}${adds}${rems}`;
}

function recapSentence(cart: Cart) {
  if (cart.items.length === 0) return "Je n’ai rien noté pour l’instant. Dites-moi ce que vous souhaitez commander.";

  const lines = cart.items.map(itemSentence).join(", ");
  const total = cartTotal(cart);
  return `Je récapitule : ${lines}. Total ${total} euros. Vous confirmez ?`;
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

/** ========= Adresse : validations simples ========= */
function looksLikeHouseNumber(s: string) {
  const t = norm(s);
  return /\d/.test(t) && t.length <= 10;
}
function looksLikeStreet(s: string) {
  const t = norm(s);
  return t.length >= 4;
}
function looksLikeCity(s: string) {
  const t = norm(s);
  return t.length >= 2;
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
    if (!restaurantId) {
      return xml(notConfiguredTwiml(baseUrl));
    }

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

      if (!callSid) {
        return prisma.order.create({ data: createData });
      }

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

    /** ======== ROUTING ======== */

    // Étape d’entrée principale
    if (step === "listen") {
      const order = await getOrCreateOrder();
      const { cart } = await loadCart(order.id);

      // Menu
      if (!speech.trim() || wantsMenu(speech)) {
        return xml(gatherPlay(baseUrl, "listen", menuSentence()));
      }

      // Ajout item
      const qty = detectQty(speech);

      const pizza = findPizza(speech);
      const drink = findDrink(speech);
      const dessert = findDessert(speech);

      if (pizza) {
        const adds = detectToppingsAdd(speech);
        const rems = detectRemovals(speech);

        cart.items.push({
          kind: "pizza",
          name: pizza.label,
          qty,
          additions: adds.length ? adds : undefined,
          removals: rems.length ? rems : undefined,
          unitPrice: pizza.price + adds.reduce((sum, a) => sum + (TOPPINGS.find((t) => t.label === a)?.price ?? 0), 0),
        });

        await saveCart(order.id, cart);

        return xml(
          gatherPlay(
            baseUrl,
            "more",
            `Très bien. J’ajoute ${qty} ${pizza.label}. Souhaitez-vous autre chose ?`
          )
        );
      }

      if (drink) {
        cart.items.push({
          kind: "drink",
          name: drink.label,
          qty,
          unitPrice: drink.price,
        });
        await saveCart(order.id, cart);

        return xml(gatherPlay(baseUrl, "more", `Ok. J’ajoute ${qty} ${drink.label}. Souhaitez-vous autre chose ?`));
      }

      if (dessert) {
        cart.items.push({
          kind: "dessert",
          name: dessert.label,
          qty,
          unitPrice: dessert.price,
        });
        await saveCart(order.id, cart);

        return xml(gatherPlay(baseUrl, "more", `Ok. J’ajoute ${qty} ${dessert.label}. Souhaitez-vous autre chose ?`));
      }

      // Si le client dit "c'est tout" alors on va au récap
      if (isDone(speech)) {
        return xml(gatherPlay(baseUrl, "recap", recapSentence(cart)));
      }

      // Sinon on ne comprend pas
      return xml(
        gatherPlay(
          baseUrl,
          "listen",
          `Je n’ai pas compris. Vous pouvez dire par exemple : “une Margherita”, ou “un Coca”, ou “un Tiramisu”. Si vous voulez, je peux aussi vous lire le menu.`
        )
      );
    }

    // Après un ajout : on demande "autre chose ?"
    if (step === "more") {
      const order = await getOrCreateOrder();
      const { cart } = await loadCart(order.id);

      if (!speech.trim()) {
        return xml(gatherPlay(baseUrl, "more", "Souhaitez-vous autre chose ?"));
      }

      if (isYes(speech) || wantsMore(speech)) {
        return xml(gatherPlay(baseUrl, "listen", "Très bien. Dites-moi ce que vous voulez ajouter."));
      }

      if (isNo(speech) || isDone(speech)) {
        // Si on n’a jamais proposé boissons/desserts, on le fait maintenant
        if (!cart.askedExtras) {
          cart.askedExtras = true;
          await saveCart(order.id, cart);
          return xml(gatherPlay(baseUrl, "extras", "Souhaitez-vous une boisson ou un dessert ?"));
        }

        return xml(gatherPlay(baseUrl, "recap", recapSentence(cart)));
      }

      // Si le client commence à dire un produit directement
      return xml(gatherPlay(baseUrl, "listen", "D’accord. Dites-moi ce que vous souhaitez ajouter."));
    }

    // Proposition boissons / desserts
    if (step === "extras") {
      const order = await getOrCreateOrder();
      const { cart } = await loadCart(order.id);

      if (!speech.trim()) {
        return xml(gatherPlay(baseUrl, "extras", "Souhaitez-vous une boisson ou un dessert ?"));
      }

      if (isNo(speech) || isDone(speech)) {
        return xml(gatherPlay(baseUrl, "recap", recapSentence(cart)));
      }

      // Si oui, on repart en ajout
      if (isYes(speech) || wantsMore(speech)) {
        return xml(
          gatherPlay(
            baseUrl,
            "listen",
            `D’accord. Vous pouvez dire par exemple : ${DRINKS[0].label}, ${DRINKS[1].label}, ou ${DESSERTS[0].label}.`
          )
        );
      }

      // Si le client donne un item direct
      return xml(gatherPlay(baseUrl, "listen", "Très bien. Dites-moi ce que vous souhaitez prendre."));
    }

    // Récap + confirmation + modifications
    if (step === "recap") {
      const order = await getOrCreateOrder();
      const { cart } = await loadCart(order.id);

      if (!speech.trim()) {
        return xml(gatherPlay(baseUrl, "recap", recapSentence(cart)));
      }

      if (isYes(speech)) {
        // Validé : on continue vers livraison / emporter
        return xml(gatherPlay(baseUrl, "type", "Parfait. C’est en livraison ou à emporter ?"));
      }

      if (isNo(speech) || wantsChange(speech)) {
        return xml(
          gatherPlay(
            baseUrl,
            "edit",
            "D’accord. Dites-moi ce que vous voulez changer. Par exemple : “enlève le Coca”, ou “ajoute une Reine”, ou “une Margherita sans basilic”."
          )
        );
      }

      return xml(gatherPlay(baseUrl, "recap", "Dites oui pour confirmer, ou dites ce que vous voulez modifier."));
    }

    // Modification sans repartir à zéro
    if (step === "edit") {
      const order = await getOrCreateOrder();
      const { cart } = await loadCart(order.id);

      const t = norm(speech);

      if (!t) {
        return xml(gatherPlay(baseUrl, "edit", "Dites-moi ce que vous voulez changer."));
      }

      // 1) Annuler / retirer un produit (simple)
      // Ex: "enlève le coca", "retire tiramisu", "annule la reine"
      if (includesAny(t, ["enlève", "retire", "annule", "supprime"])) {
        // chercher quel item
        const pizza = findPizza(t);
        const drink = findDrink(t);
        const dessert = findDessert(t);

        const targetName = pizza?.label || drink?.label || dessert?.label || "";

        if (targetName) {
          const idx = cart.items.findIndex((it) => norm(it.name) === norm(targetName));
          if (idx !== -1) {
            cart.items.splice(idx, 1);
            await saveCart(order.id, cart);
            return xml(gatherPlay(baseUrl, "recap", `Ok, j’enlève ${targetName}. ${recapSentence(cart)}`));
          }
          return xml(gatherPlay(baseUrl, "edit", `Je ne le vois pas dans votre commande. Dites-moi ce que vous voulez enlever.`));
        }

        // sinon, on enlève le dernier item par défaut
        if (cart.items.length > 0) {
          const removed = cart.items.pop()!;
          await saveCart(order.id, cart);
          return xml(gatherPlay(baseUrl, "recap", `Ok, j’enlève ${removed.name}. ${recapSentence(cart)}`));
        }

        return xml(gatherPlay(baseUrl, "edit", "Vous n’avez rien dans la commande. Dites-moi ce que vous voulez ajouter."));
      }

      // 2) Ajouter quelque chose (on réutilise la logique listen)
      const qty = detectQty(t);
      const pizza = findPizza(t);
      const drink = findDrink(t);
      const dessert = findDessert(t);

      if (pizza) {
        const adds = detectToppingsAdd(t);
        const rems = detectRemovals(t);

        cart.items.push({
          kind: "pizza",
          name: pizza.label,
          qty,
          additions: adds.length ? adds : undefined,
          removals: rems.length ? rems : undefined,
          unitPrice: pizza.price + adds.reduce((sum, a) => sum + (TOPPINGS.find((x) => x.label === a)?.price ?? 0), 0),
        });

        await saveCart(order.id, cart);
        return xml(gatherPlay(baseUrl, "recap", `Ok, j’ajoute ${qty} ${pizza.label}. ${recapSentence(cart)}`));
      }

      if (drink) {
        cart.items.push({ kind: "drink", name: drink.label, qty, unitPrice: drink.price });
        await saveCart(order.id, cart);
        return xml(gatherPlay(baseUrl, "recap", `Ok, j’ajoute ${qty} ${drink.label}. ${recapSentence(cart)}`));
      }

      if (dessert) {
        cart.items.push({ kind: "dessert", name: dessert.label, qty, unitPrice: dessert.price });
        await saveCart(order.id, cart);
        return xml(gatherPlay(baseUrl, "recap", `Ok, j’ajoute ${qty} ${dessert.label}. ${recapSentence(cart)}`));
      }

      // 3) Si le client dit "sans ..." sans préciser la pizza, on applique au dernier item pizza
      const removals = detectRemovals(t);
      const adds = detectToppingsAdd(t);

      if (removals.length || adds.length) {
        const lastPizzaIdx = [...cart.items].reverse().findIndex((it) => it.kind === "pizza");
        if (lastPizzaIdx !== -1) {
          const realIdx = cart.items.length - 1 - lastPizzaIdx;
          const it = cart.items[realIdx];

          it.removals = Array.from(new Set([...(it.removals ?? []), ...removals]));
          it.additions = Array.from(new Set([...(it.additions ?? []), ...adds]));

          // recalcul prix unitaire (simple)
          const pizzaBase = PIZZAS.find((p) => p.label === it.name)?.price ?? it.unitPrice;
          const addPrice = (it.additions ?? []).reduce((sum, a) => sum + (TOPPINGS.find((x) => x.label === a)?.price ?? 0), 0);
          it.unitPrice = pizzaBase + addPrice;

          await saveCart(order.id, cart);
          return xml(gatherPlay(baseUrl, "recap", `D’accord. ${recapSentence(cart)}`));
        }

        return xml(gatherPlay(baseUrl, "edit", "D’accord, mais je ne vois pas de pizza à modifier. Dites-moi ce que vous voulez ajouter."));
      }

      return xml(gatherPlay(baseUrl, "edit", "Je n’ai pas compris la modification. Dites-moi ce que vous voulez changer."));
    }

    // Livraison / emporter
    if (step === "type") {
      const order = await getOrCreateOrder();
      const t = norm(speech);

      let type: "delivery" | "takeaway" | null = null;
      if (t.includes("livraison") || t.includes("domicile") || t.includes("livrer")) type = "delivery";
      if (t.includes("emporter") || t.includes("à emporter") || t.includes("a emporter") || t.includes("sur place") || t.includes("venir")) type = "takeaway";

      if (!type) {
        return xml(gatherPlay(baseUrl, "type", "C’est en livraison ou à emporter ?"));
      }

      await prisma.order.update({ where: { id: order.id }, data: { type } });

      return xml(gatherPlay(baseUrl, "name", "Très bien. Quel est votre nom pour la commande ?"));
    }

    // Nom
    if (step === "name") {
      const order = await getOrCreateOrder();
      const name = speech.trim();
      if (!name) return xml(gatherPlay(baseUrl, "name", "Quel est votre nom pour la commande ?"));

      await prisma.order.update({ where: { id: order.id }, data: { customerName: name } });
      return xml(gatherPlay(baseUrl, "phone", "Merci. Quel est votre numéro de téléphone ?"));
    }

    // Téléphone (toujours demandé)
    if (step === "phone") {
      const order = await getOrCreateOrder();
      const phone = speech.trim();
      if (!phone) return xml(gatherPlay(baseUrl, "phone", "Quel est votre numéro de téléphone ?"));

      const updated = await prisma.order.update({ where: { id: order.id }, data: { phone } });

      if (updated.type === "delivery") {
        return xml(gatherPlay(baseUrl, "addr_number", "Parfait. Quel est le numéro de maison ou d’appartement ?"));
      }

      // takeaway
      await prisma.order.update({ where: { id: updated.id }, data: { status: "confirmed" } });
      return xml(
        hangupTwiml(
          baseUrl,
          "C’est noté. Votre commande est bien enregistrée. Vous serez appelé lorsque votre commande sera prête. Merci et à bientôt."
        )
      );
    }

    // Adresse : numéro
    if (step === "addr_number") {
      const order = await getOrCreateOrder();
      const v = speech.trim();
      if (!v || !looksLikeHouseNumber(v)) {
        return xml(gatherPlay(baseUrl, "addr_number", "Je n’ai pas bien compris. Quel est le numéro de maison ou d’appartement ?"));
      }

      // stock temporaire dans extras JSON
      const { cart } = await loadCart(order.id);
      const data = cart as any;
      data.address = data.address ?? {};
      data.address.number = v;
      await saveCart(order.id, data);

      return xml(gatherPlay(baseUrl, "addr_street", "Merci. Quel est le nom de la rue ?"));
    }

    // Adresse : rue
    if (step === "addr_street") {
      const order = await getOrCreateOrder();
      const v = speech.trim();
      if (!v || !looksLikeStreet(v)) {
        return xml(gatherPlay(baseUrl, "addr_street", "Je n’ai pas bien compris. Quel est le nom de la rue ?"));
      }

      const { cart } = await loadCart(order.id);
      const data = cart as any;
      data.address = data.address ?? {};
      data.address.street = v;
      await saveCart(order.id, data);

      return xml(gatherPlay(baseUrl, "addr_city", "Merci. Et votre ville ?"));
    }

    // Adresse : ville + finalisation
    if (step === "addr_city") {
      const order = await getOrCreateOrder();
      const v = speech.trim();
      if (!v || !looksLikeCity(v)) {
        return xml(gatherPlay(baseUrl, "addr_city", "Je n’ai pas bien compris. Quelle est votre ville ?"));
      }

      const { cart } = await loadCart(order.id);
      const data = cart as any;
      data.address = data.address ?? {};
      data.address.city = v;
      await saveCart(order.id, data);

      const number = data.address?.number ?? "";
      const street = data.address?.street ?? "";
      const city = data.address?.city ?? "";
      const full = `${number} ${street}, ${city}`.trim();

      await prisma.order.update({
        where: { id: order.id },
        data: {
          address: full,
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

    // fallback
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
