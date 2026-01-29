"use client";

import { useEffect, useMemo, useState } from "react";

type Order = {
  id?: string;
  createdAt: string;
  clientOrderId?: string;

  type: string;
  product: string;
  size: string;
  extras: string;
  total: number;
  status?: string;
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function badgeStyle() {
  return {
    display: "inline-block",
    fontSize: 12,
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid #ddd",
    background: "#fff",
    opacity: 0.9,
  } as const;
}

function normalizeOrdersResponse(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.orders)) return data.orders;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function getOrderKey(o: Order) {
  const id = (o?.id ?? "").toString().trim();
  const co = (o?.clientOrderId ?? "").toString().trim();
  const bad = new Set(["", "undefined", "null", "NaN"]);
  if (!bad.has(id)) return id;
  if (!bad.has(co)) return co;
  return "";
}

export default function RestaurantPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchOrdersOnce() {
    try {
      const res = await fetch("/api/orders", { cache: "no-store" });
      const data = await res.json();
      const list = normalizeOrdersResponse(data) as Order[];
      setOrders(list);
    } catch (e) {
      console.log("fetchOrders error:", e);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // 1) snapshot initial
    fetchOrdersOnce();

    // 2) live via SSE
    const es = new EventSource("/api/orders/stream");

    es.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg?.type === "orders" && Array.isArray(msg?.orders)) {
          setOrders(msg.orders);
          setLoading(false);
        }
      } catch {}
    };

    es.onerror = () => {
      // fallback léger : si SSE tombe, on repasse sur snapshot périodique
      es.close();
      const t = setInterval(fetchOrdersOnce, 4000);
      return () => clearInterval(t);
    };

    return () => {
      es.close();
    };
  }, []);

  async function setStatus(orderKey: string, status: string) {
    const safeKey = typeof orderKey === "string" ? orderKey.trim() : "";

    if (!safeKey || safeKey === "undefined" || safeKey === "null") {
      alert("Impossible : clé commande invalide (id/clientOrderId manquant).");
      return;
    }

    const res = await fetch(`/api/orders/${encodeURIComponent(safeKey)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    let payload: any = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }

    if (!res.ok) {
      alert(`PATCH failed (${res.status})\n${JSON.stringify(payload, null, 2)}`);
      return;
    }
  }

  const groups = useMemo(() => {
    const norm = (v: any) => String(v ?? "").trim().toLowerCase();
    const sortByDateDesc = (a: Order, b: Order) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

    const by = (s: string) => orders.filter((o) => norm(o.status) === s).sort(sortByDateDesc);

    const confirmed = orders
      .filter((o) => {
        const s = norm(o.status);
        return s === "" || s === "confirmed";
      })
      .sort(sortByDateDesc);

    return {
      confirmed,
      preparing: by("preparing"),
      ready: by("ready"),
      done: by("done"),
      cancelled: by("cancelled"),
    };
  }, [orders]);

  const Card = ({ o }: { o: Order }) => {
    const isDelivery = o.type === "delivery";
    const extrasText = o.extras?.trim() ? o.extras : "Aucun";

    const orderKey = getOrderKey(o);
    const disabled = !orderKey;

    return (
      <div
        style={{
          border: "1px solid #eee",
          borderRadius: 16,
          padding: 14,
          background: "white",
          boxShadow: "0 1px 0 rgba(0,0,0,0.03)",
          opacity: disabled ? 0.75 : 1,
        }}
      >
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 16, fontWeight: 900 }}>
            🍕 {o.product} — {o.size}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={badgeStyle()}>{isDelivery ? "🚚 Livraison" : "🥡 À emporter"}</span>
            <span style={badgeStyle()}>⏱ {formatTime(o.createdAt)}</span>
            <span style={badgeStyle()}>💰 {o.total}€</span>
            <span style={badgeStyle()}>status: {o.status ?? "—"}</span>

            {disabled && <span style={badgeStyle()}>⚠️ id manquant</span>}
          </div>

          <div style={{ opacity: 0.9 }}>
            <b>Suppléments :</b> {extrasText}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button
            disabled={disabled}
            onClick={() => setStatus(orderKey, "preparing")}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #ddd",
              fontWeight: 800,
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.6 : 1,
            }}
          >
            👨‍🍳 En préparation
          </button>

          <button
            disabled={disabled}
            onClick={() => setStatus(orderKey, "ready")}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #ddd",
              fontWeight: 800,
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.6 : 1,
            }}
          >
            ✅ Prête
          </button>

          <button
            disabled={disabled}
            onClick={() => setStatus(orderKey, "done")}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #ddd",
              fontWeight: 800,
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.6 : 1,
            }}
          >
            📦 Terminée
          </button>

          <button
            disabled={disabled}
            onClick={() => setStatus(orderKey, "cancelled")}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #f0caca",
              fontWeight: 800,
              cursor: disabled ? "not-allowed" : "pointer",
              color: "#8a1f1f",
              background: "#fff7f7",
              opacity: disabled ? 0.6 : 1,
            }}
          >
            ✖ Annuler
          </button>
        </div>
      </div>
    );
  };

  const Column = ({ title, subtitle, list }: { title: string; subtitle?: string; list: Order[] }) => (
    <div style={{ border: "1px solid #eee", borderRadius: 18, padding: 14, background: "#fafafa", minHeight: 220 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, opacity: 0.7 }}>{subtitle}</div>}
        </div>
        <div style={badgeStyle()}>{list.length}</div>
      </div>

      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        {list.length === 0 ? <div style={{ opacity: 0.65 }}>Aucune commande</div> : list.map((o, idx) => <Card key={getOrderKey(o) || `no-key-${idx}`} o={o} />)}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#fff" }}>
      <header style={{ borderBottom: "1px solid #eee", padding: 14 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>🍕 Restaurant — Cuisine</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Temps réel</div>
          </div>

          <button
            onClick={fetchOrdersOnce}
            style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd", fontWeight: 800, cursor: "pointer" }}
          >
            ↻ Rafraîchir
          </button>
        </div>
      </header>

      <main style={{ padding: 14 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <p style={{ marginBottom: 12 }}>Nombre de commandes reçues : {orders.length}</p>

          {loading ? (
            <div>Chargement…</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Column title="🆕 Nouvelles" subtitle="À prendre en charge" list={groups.confirmed} />
              <Column title="👨‍🍳 En préparation" subtitle="En cours" list={groups.preparing} />
              <Column title="✅ Prêtes" subtitle="À remettre / livrer" list={groups.ready} />
              <Column title="📦 Terminées" subtitle="Historique" list={groups.done} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
