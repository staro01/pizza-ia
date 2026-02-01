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

/** ========= MENU TEST ========= */
const PIZZAS = [
  { key: "margherita", label: "Margherita", price: 10 },
  { key: "reine", label: "Reine", price: 11 },
  { key: "pepperoni", label: "Pepperoni", price: 12 },
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

/**
 * Nettoyage.
 * But: ne pas polluer le parsing avec "svp", "merci", etc.
 */
function sanitizeSpeech(s: string) {
  let t = norm(s);
  t = t.replace(/[!?.,;:]/g, " ");

  const trash = [
    "s il vous plait",
    "s'il vous plait",
    "svp",
    "stp",
    "merci",
    "merci beaucoup",
    "je vous remercie",
    "bonjour",
    "bonsoir",
    "allô",
    "allo",
  ];
  for (const x of trash) t = t.replaceAll(x, " ");

  const starters = [
    "je voudrais",
    "j'aimerais",
    "je veux",
    "je prend",
    "je prends",
    "je vais prendre",
    "je vais vous prendre",
    "donnez moi",
    "donne moi",
    "je souhaite",
    "pourrais je avoir",
    "est ce que je peux avoir",
    "je peux avoir",
    "ça sera",
    "ce sera",
  ];
  for (const st of starters) {
    if (t.startsWith(st)) {
      t = t.slice(st.length);
      break;
    }
  }

  t = t.replace(/\s+/g, " ").trim();
  return t;
}

function isYes(s: string) {
  const t = norm(s);
  return t === "oui" || t.includes("oui") || t.includes("ok") || t.includes("d'accord") || t.includes("parfait");
}

function isNo(s: string) {
  const t = norm(s);
  return t === "non" || t.includes("non");
}

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

function wantsMenu(s: string) {
  const t = norm(s);
  return (
    t.includes("menu") ||
    t.includes("carte") ||
    t.includes("vous avez quoi") ||
    t.includes("qu'est ce que vous avez") ||
    t.includes("quelles pizzas") ||
    t.includes("vos pizzas") ||
    t.includes("pizzas disponibles")
  );
}

function wantsDrinksMenu(s: string) {
  const t = norm(s);
  return t.includes("boisson") || t.includes("à boire") || t.includes("a boire") || t.includes("soda") || t.includes("coca");
}

function wantsDessertsMenu(s: string) {
  const t = norm(s);
  return t.includes("dessert") || t.includes("sucré") || t.includes("sucre") || t.includes("tiramisu") || t.includes("brownie");
}

function pizzasMenuSentence() {
  const pizzas = PIZZAS.map((p) => `${p.label} à ${p.price} euros`).join(", ");
  return `Voici les pizzas : ${pizzas}. Dites-moi ce que vous voulez. Par exemple : une Reine sans champignons.`;
}

function drinksMenuSentence() {
  const drinks = DRINKS.map((d) => `${d.label} à ${d.price} euros`).join(", ");
  return `Pour les boissons, nous avons : ${drinks}.`;
}

function dessertsMenuSentence() {
  const desserts = DESSERTS.map((d) => `${d.label} à ${d.price} euros`).join(", ");
  return `Pour les desserts, nous avons : ${desserts}.`;
}

/** ========= Quantités ========= */
function detectQty(s: string) {
  const t = sanitizeSpeech(s);

  const m = t.match(/\b([1-9])\b/);
  if (m) return Number(m[1]);

  if (t.includes("une") || t.includes("un ")) return 1;
  if (t.includes("deux")) return 2;
  if (t.includes("trois")) return 3;
  if (t.includes("quatre")) return 4;

  return 1;
}

/** ========= Cart ========= */
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

function hasAnyPizza(cart: Cart) {
  return cart.items.some((i) => i.kind === "pizza");
}

/** ========= Détection produits ========= */
function findPizzaInText(s: string) {
  const t = sanitizeSpeech(s);
  return PIZZAS.find((p) => t.includes(p.key) || t.includes(norm(p.label))) ?? null;
}

function findDrinkInText(s: string) {
  const t = sanitizeSpeech(s);
  return DRINKS.find((d) => t.includes(d.key) || t.includes(norm(d.label))) ?? null;
}

function findDessertInText(s: string) {
  const t = sanitizeSpeech(s);
  return DESSERTS.find((d) => t.includes(d.key) || t.includes(norm(d.label))) ?? null;
}

/** ========= “sans …” (FIX) =========
 * Problème actuel : ça capturait toute la phrase.
 * Ici : on capture juste ce qui suit "sans" jusqu’à :
 * - "avec"
 * - "plus"
 * - "ajoute"
 * - "et une / et un / et deux / ..."
 * - fin
 */
function normalizeWord(w: string) {
  let x = norm(w).replace(/[!?.,;:]/g, "").trim();
  x = x.replace(/^(de|du|des|la|le|les|un|une)\s+/g, "");
  if (x.endsWith("s") && x.length > 3) x = x.slice(0, -1);
  return x.trim();
}

function detectRemovals(s: string) {
  const t = sanitizeSpeech(s);
  if (!t.includes("sans")) return [];

  const removals: string[] = [];

  // On récupère chaque "sans ...".
  const re = /sans\s+(.+?)(?=\bavec\b|\bplus\b|\bajoute\b|\bet\s+(?:un|une|deux|trois|quatre|\d)\b|$)/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(t))) {
    const chunk = (m[1] ?? "").trim();
    if (!chunk) continue;

    // chunk peut être: "champignons et olives"
    const parts = chunk
      .split(/,| et /g)
      .map((x) => x.trim())
      .filter(Boolean);

    for (const p of parts) {
      const w = normalizeWord(p);
      if (!w) continue;

      // si c’est un topping connu, on renvoie son label propre
      const top = TOPPINGS.find((x) => w.includes(norm(x.key)) || w.includes(norm(x.label)));
      if (top) removals.push(top.label);
      else removals.push(w);
    }
  }

  return Array.from(new Set(removals)).slice(0, 6);
}

/** ========= “avec …” (FIX) =========
 * Avant : si la phrase contenait "champignons" dans "sans champignons",
 * ça ajoutait Champignons en additions.
 * Ici : on n’ajoute des toppings QUE si on trouve un vrai déclencheur:
 * "avec", "en plus", "supplément", "ajoute".
 */
function detectToppingsAdd(s: string) {
  const t = sanitizeSpeech(s);
  const triggers = ["avec ", "en plus", "supplément", "supplement", "ajoute", "rajoute"];

  const hasTrigger = triggers.some((tr) => t.includes(tr));
  if (!hasTrigger) return [];

  // On prend ce qui suit "avec" si présent, sinon toute la phrase (mais trigger obligatoire)
  let scope = t;
  const idx = t.indexOf("avec ");
  if (idx !== -1) scope = t.slice(idx + 5);

  const adds: string[] = [];
  for (const top of TOPPINGS) {
    if (scope.includes(top.key) || scope.includes(norm(top.label))) adds.push(top.label);
  }
  return Array.from(new Set(adds));
}

/** ========= Segments =========
 * On split sur virgules / points / point-virgule.
 * On évite de split sur "et" (ça casse "sans X et Y").
 */
function splitSegments(s: string) {
  const t = sanitizeSpeech(s);
  if (!t) return [];
  const raw = t.split(/,|;|\./g).map((x) => x.trim()).filter(Boolean);
  return raw.length ? raw : [t];
}

/** ========= Parse phrase -> items ========= */
function parseUtteranceToItems(s: string) {
  const segs = splitSegments(s);
  const allItems: CartItem[] = [];

  for (const seg of segs) {
    const qty = detectQty(seg);

    const pizza = findPizzaInText(seg);
    const drink = findDrinkInText(seg);
    const dessert = findDessertInText(seg);

    if (pizza) {
      const rems = detectRemovals(seg);
      let adds = detectToppingsAdd(seg);

      // ✅ important: un ingrédient en removals ne doit jamais être aussi en additions
      const remNorm = new Set(rems.map((r) => norm(r)));
      adds = adds.filter((a) => !remNorm.has(norm(a)));

      const addPrice = adds.reduce((sum, a) => sum + (TOPPINGS.find((x) => x.label === a)?.price ?? 0), 0);

      allItems.push({
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
      allItems.push({ kind: "drink", name: drink.label, qty, unitPrice: drink.price });
      continue;
    }

    if (dessert) {
      allItems.push({ kind: "dessert", name: dessert.label, qty, unitPrice: dessert.price });
      continue;
    }

    // Cas fréquent: "une reine sans champignons et une pepperoni"
    // On ne split pas sur "et". Donc on essaie une 2e passe "et une / et un".
    const t = sanitizeSpeech(seg);
    const subParts = t.split(/\bet\s+(?:un|une|deux|trois|quatre|\d)\b/g).map((x) => x.trim()).filter(Boolean);
    if (subParts.length > 1) {
      for (const sp of subParts) {
        const pz = findPizzaInText(sp);
        const dr = findDrinkInText(sp);
        const ds = findDessertInText(sp);
        const q = detectQty(sp);

        if (pz) {
          const rems = detectRemovals(sp);
          let adds = detectToppingsAdd(sp);
          const remNorm = new Set(rems.map((r) => norm(r)));
          adds = adds.filter((a) => !remNorm.has(norm(a)));
          const addPrice = adds.reduce((sum, a) => sum + (TOPPINGS.find((x) => x.label === a)?.price ?? 0), 0);

          allItems.push({
            kind: "pizza",
            name: pz.label,
            qty: q,
            additions: adds.length ? adds : undefined,
            removals: rems.length ? rems : undefined,
            unitPrice: pz.price + addPrice,
          });
          continue;
        }
        if (dr) {
          allItems.push({ kind: "drink", name: dr.label, qty: q, unitPrice: dr.price });
          continue;
        }
        if (ds) {
          allItems.push({ kind: "dessert", name: ds.label, qty: q, unitPrice: ds.price });
          continue;
        }
      }
    }
  }

  return allItems;
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

/** ========= Product summary (FIX) =========
 * On remet un résumé pizzas dans Order.product.
 * Exemple: "Pepperoni x1, Reine x1"
 */
function productSummary(cart: Cart) {
  const pizzas = cart.items.filter((i) => i.kind === "pizza");
  if (pizzas.length === 0) return "";
  return pizzas.map((p) => `${p.name} x${p.qty}`).join(", ");
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

/** ========= Adresse complète ========= */
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
    const speech = ((form.get("SpeechResult") ?? "") as string).toString().trim();
    const callSid = ((form.get("CallSid") ?? "") as string).toString();
    const to = ((form.get("To") ?? "") as string).toString();

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

    // ✅ FIX: on sauve extras + total + product
    async function saveCart(orderId: string, cart: Cart) {
      const total = cartTotal(cart);
      const prod = productSummary(cart);

      await prisma.order.update({
        where: { id: orderId },
        data: {
          extras: JSON.stringify(cart),
          total,
          product: prod,
        },
      });
    }

    /** ===== listen : pizzas ===== */
    if (step === "listen") {
      const order = await getOrCreateOrder();
      const { cart } = await loadCart(order.id);

      if (!speech) {
        return xml(gatherPlay(baseUrl, "listen", "Dites-moi les pizzas que vous voulez."));
      }

      if (wantsMenu(speech)) {
        return xml(gatherPlay(baseUrl, "listen", pizzasMenuSentence()));
      }

      // si quelqu'un demande déjà "boissons/desserts" ici, on peut répondre
      if (wantsDrinksMenu(speech)) {
        return xml(gatherPlay(baseUrl, "listen", `${drinksMenuSentence()} Dites-moi ce que vous voulez.`));
      }
      if (wantsDessertsMenu(speech)) {
        return xml(gatherPlay(baseUrl, "listen", `${dessertsMenuSentence()} Dites-moi ce que vous voulez.`));
      }

      const items = parseUtteranceToItems(speech);
      if (items.length > 0) {
        cart.items.push(...items);
        await saveCart(order.id, cart);

        if (isDone(speech)) {
          if (hasAnyPizza(cart) && !cart.askedExtras) {
            cart.askedExtras = true;
            await saveCart(order.id, cart);
            return xml(gatherPlay(baseUrl, "extras", "Très bien. Voulez-vous une boisson ou un dessert ?"));
          }
          return xml(gatherPlay(baseUrl, "recap", recapSentence(cart)));
        }

        return xml(gatherPlay(baseUrl, "more", "Très bien. Voulez-vous ajouter une autre pizza ?"));
      }

      return xml(
        gatherPlay(
          baseUrl,
          "listen",
          "Je n’ai pas compris. Dites par exemple : une Reine sans champignons, et une Pepperoni."
        )
      );
    }

    /** ===== more : autres pizzas ===== */
    if (step === "more") {
      const order = await getOrCreateOrder();
      const { cart } = await loadCart(order.id);

      if (!speech) return xml(gatherPlay(baseUrl, "more", "Voulez-vous ajouter une autre pizza ?"));

      const items = parseUtteranceToItems(speech);
      if (items.length > 0) {
        cart.items.push(...items);
        await saveCart(order.id, cart);
        return xml(gatherPlay(baseUrl, "more", "Très bien. Voulez-vous ajouter une autre pizza ?"));
      }

      if (isYes(speech)) {
        return xml(gatherPlay(baseUrl, "listen", "D’accord. Dites-moi la pizza que vous voulez ajouter."));
      }

      if (isNo(speech) || isDone(speech)) {
        if (hasAnyPizza(cart) && !cart.askedExtras) {
          cart.askedExtras = true;
          await saveCart(order.id, cart);
          return xml(gatherPlay(baseUrl, "extras", "Très bien. Voulez-vous une boisson ou un dessert ?"));
        }
        return xml(gatherPlay(baseUrl, "recap", recapSentence(cart)));
      }

      return xml(gatherPlay(baseUrl, "more", "Voulez-vous ajouter une autre pizza ?"));
    }

    /** ===== extras : boissons/desserts ===== */
    if (step === "extras") {
      const order = await getOrCreateOrder();
      const { cart } = await loadCart(order.id);

      if (!speech) return xml(gatherPlay(baseUrl, "extras", "Voulez-vous une boisson ou un dessert ?"));

      // ✅ FIX: si client dit "vous avez quoi" => on lit la liste
      if (wantsMenu(speech) || speech.toLowerCase().includes("vous avez quoi")) {
        const msg = `${drinksMenuSentence()} ${dessertsMenuSentence()} Dites-moi ce que vous voulez.`;
        return xml(gatherPlay(baseUrl, "extras", msg));
      }

      // si le client demande spécifiquement boissons/desserts
      if (wantsDrinksMenu(speech)) {
        return xml(gatherPlay(baseUrl, "extras", `${drinksMenuSentence()} Dites-moi ce que vous voulez.`));
      }
      if (wantsDessertsMenu(speech)) {
        return xml(gatherPlay(baseUrl, "extras", `${dessertsMenuSentence()} Dites-moi ce que vous voulez.`));
      }

      if (isNo(speech) || isDone(speech)) {
        return xml(gatherPlay(baseUrl, "recap", recapSentence(cart)));
      }

      if (isYes(speech)) {
        return xml(
          gatherPlay(
            baseUrl,
            "extras",
            `Vous pouvez dire par exemple : ${DRINKS[0].label}, ${DRINKS[1].label}, ou ${DESSERTS[0].label}.`
          )
        );
      }

      const items = parseUtteranceToItems(speech);
      if (items.length > 0) {
        cart.items.push(...items);
        await saveCart(order.id, cart);
        return xml(gatherPlay(baseUrl, "extras_more", "Très bien. Voulez-vous autre chose ?"));
      }

      return xml(gatherPlay(baseUrl, "extras", "Je n’ai pas compris. Dites une boisson ou un dessert, ou dites “vous avez quoi ?”."));
    }

    if (step === "extras_more") {
      const order = await getOrCreateOrder();
      const { cart } = await loadCart(order.id);

      if (!speech) return xml(gatherPlay(baseUrl, "extras_more", "Voulez-vous autre chose ?"));

      if (wantsMenu(speech) || speech.toLowerCase().includes("vous avez quoi")) {
        const msg = `${drinksMenuSentence()} ${dessertsMenuSentence()} Dites-moi ce que vous voulez.`;
        return xml(gatherPlay(baseUrl, "extras_more", msg));
      }

      const items = parseUtteranceToItems(speech);
      if (items.length > 0) {
        cart.items.push(...items);
        await saveCart(order.id, cart);
        return xml(gatherPlay(baseUrl, "extras_more", "Très bien. Voulez-vous autre chose ?"));
      }

      if (isYes(speech)) {
        return xml(gatherPlay(baseUrl, "extras", "D’accord. Dites-moi ce que vous voulez ajouter."));
      }

      if (isNo(speech) || isDone(speech)) {
        return xml(gatherPlay(baseUrl, "recap", recapSentence(cart)));
      }

      return xml(gatherPlay(baseUrl, "extras_more", "Voulez-vous autre chose ?"));
    }

    /** ===== recap + edit ===== */
    if (step === "recap") {
      const order = await getOrCreateOrder();
      const { cart } = await loadCart(order.id);

      if (!speech) return xml(gatherPlay(baseUrl, "recap", recapSentence(cart)));

      if (isYes(speech)) {
        return xml(gatherPlay(baseUrl, "type", "Parfait. C’est en livraison ou à emporter ?"));
      }

      if (isNo(speech) || wantsChange(speech)) {
        return xml(
          gatherPlay(
            baseUrl,
            "edit",
            "D’accord. Dites-moi la modification. Par exemple : enlève le Coca, ou ajoute une Reine sans champignons."
          )
        );
      }

      return xml(gatherPlay(baseUrl, "recap", "Dites oui pour confirmer, ou dites ce que vous voulez modifier."));
    }

    if (step === "edit") {
      const order = await getOrCreateOrder();
      const { cart } = await loadCart(order.id);

      const t = sanitizeSpeech(speech);
      if (!t) return xml(gatherPlay(baseUrl, "edit", "Dites-moi ce que vous voulez changer."));

      // Retirer
      if (t.includes("enleve") || t.includes("enlève") || t.includes("retire") || t.includes("annule") || t.includes("supprime")) {
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
          return xml(gatherPlay(baseUrl, "edit", `Je ne vois pas ${targetName} dans la commande.`));
        }

        if (cart.items.length > 0) {
          const removed = cart.items.pop()!;
          await saveCart(order.id, cart);
          return xml(gatherPlay(baseUrl, "recap", `Ok, j’enlève ${removed.name}. ${recapSentence(cart)}`));
        }

        return xml(gatherPlay(baseUrl, "edit", "Il n’y a rien à enlever."));
      }

      // Ajouter via parsing
      const items = parseUtteranceToItems(speech);
      if (items.length > 0) {
        cart.items.push(...items);
        await saveCart(order.id, cart);
        return xml(gatherPlay(baseUrl, "recap", `Ok. ${recapSentence(cart)}`));
      }

      // Appliquer "sans/avec" sur la dernière pizza
      const rems = detectRemovals(speech);
      let adds = detectToppingsAdd(speech);
      const remNorm = new Set(rems.map((r) => norm(r)));
      adds = adds.filter((a) => !remNorm.has(norm(a)));

      if (rems.length || adds.length) {
        for (let i = cart.items.length - 1; i >= 0; i--) {
          const it = cart.items[i];
          if (it.kind !== "pizza") continue;

          it.removals = Array.from(new Set([...(it.removals ?? []), ...rems]));
          it.additions = Array.from(new Set([...(it.additions ?? []), ...adds]));

          const basePrice = PIZZAS.find((p) => p.label === it.name)?.price ?? it.unitPrice;
          const addPrice = (it.additions ?? []).reduce((sum, a) => sum + (TOPPINGS.find((x) => x.label === a)?.price ?? 0), 0);
          it.unitPrice = basePrice + addPrice;

          await saveCart(order.id, cart);
          return xml(gatherPlay(baseUrl, "recap", `D’accord. ${recapSentence(cart)}`));
        }
      }

      return xml(gatherPlay(baseUrl, "edit", "Je n’ai pas compris. Dites : enlève le Coca, ou ajoute une Reine sans champignons."));
    }

    /** ===== Livraison / emporter ===== */
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

    /** ===== Nom ===== */
    if (step === "name") {
      const order = await getOrCreateOrder();
      const name = speech.trim();
      if (!name) return xml(gatherPlay(baseUrl, "name", "Quel est votre nom pour la commande ?"));

      await prisma.order.update({ where: { id: order.id }, data: { customerName: name } });
      return xml(gatherPlay(baseUrl, "phone", "Merci. Quel est votre numéro de téléphone ?"));
    }

    /** ===== Téléphone ===== */
    if (step === "phone") {
      const order = await getOrCreateOrder();
      const phone = speech.trim();
      if (!phone) return xml(gatherPlay(baseUrl, "phone", "Quel est votre numéro de téléphone ?"));

      const updated = await prisma.order.update({ where: { id: order.id }, data: { phone } });

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

    /** ===== Adresse complète ===== */
    if (step === "addr_full") {
      const order = await getOrCreateOrder();
      const addr = speech.trim();

      if (!addr) return xml(gatherPlay(baseUrl, "addr_full", "Quelle est votre adresse complète ?"));

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
        data: { address: addr, status: "confirmed" },
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
