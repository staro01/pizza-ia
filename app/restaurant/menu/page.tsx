"use client";

import { useEffect, useState } from "react";

type MenuItem = {
  id?: string;
  category: string;
  name: string;
  description?: string;
  price: number;
  available: boolean;
};

type Supplement = {
  id?: string;
  name: string;
  price: number;
  available: boolean;
};

const CATEGORIES = ["pizza", "boisson", "dessert", "entrée", "autre"];

const emptyItem = (): MenuItem => ({ category: "pizza", name: "", description: "", price: 0, available: true });
const emptySupplement = (): Supplement => ({ name: "", price: 0, available: true });

export default function MenuPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [supplements, setSupplements] = useState<Supplement[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [editingSupplement, setEditingSupplement] = useState<Supplement | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"carte" | "supplements">("carte");

  async function loadItems() {
    const res = await fetch("/api/restaurant/menu");
    const data = await res.json();
    setItems(Array.isArray(data) ? data : []);
  }

  async function loadSupplements() {
    const res = await fetch("/api/restaurant/supplements");
    const data = await res.json();
    setSupplements(Array.isArray(data) ? data : []);
  }

  async function load() {
    setLoading(true);
    await Promise.all([loadItems(), loadSupplements()]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // ── Articles ──
  async function saveItem() {
    if (!editingItem) return;
    if (!editingItem.name.trim()) return alert("Le nom est obligatoire.");
    setSaving(true);
    const res = await fetch("/api/restaurant/menu" + (editingItem.id ? `/${editingItem.id}` : ""), {
      method: editingItem.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingItem),
    });
    if (res.ok) { setEditingItem(null); await loadItems(); }
    else alert("Erreur lors de la sauvegarde.");
    setSaving(false);
  }

  async function toggleItem(item: MenuItem) {
    await fetch(`/api/restaurant/menu/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ available: !item.available }),
    });
    await loadItems();
  }

  async function deleteItem(item: MenuItem) {
    if (!confirm(`Supprimer "${item.name}" ?`)) return;
    await fetch(`/api/restaurant/menu/${item.id}`, { method: "DELETE" });
    await loadItems();
  }

  // ── Suppléments ──
  async function saveSupplement() {
    if (!editingSupplement) return;
    if (!editingSupplement.name.trim()) return alert("Le nom est obligatoire.");
    setSaving(true);
    const res = await fetch("/api/restaurant/supplements" + (editingSupplement.id ? `/${editingSupplement.id}` : ""), {
      method: editingSupplement.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingSupplement),
    });
    if (res.ok) { setEditingSupplement(null); await loadSupplements(); }
    else alert("Erreur lors de la sauvegarde.");
    setSaving(false);
  }

  async function toggleSupplement(s: Supplement) {
    await fetch(`/api/restaurant/supplements/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ available: !s.available }),
    });
    await loadSupplements();
  }

  async function deleteSupplement(s: Supplement) {
    if (!confirm(`Supprimer "${s.name}" ?`)) return;
    await fetch(`/api/restaurant/supplements/${s.id}`, { method: "DELETE" });
    await loadSupplements();
  }

  const byCategory = CATEGORIES.map(cat => ({
    cat,
    items: items.filter(i => i.category === cat),
  })).filter(g => g.items.length > 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>🍕 Ma carte</h1>
        <button onClick={() => tab === "carte" ? setEditingItem(emptyItem()) : setEditingSupplement(emptySupplement())} style={btnPrimary}>
          + Ajouter {tab === "carte" ? "un article" : "un supplément"}
        </button>
      </div>

      {/* Onglets */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <button onClick={() => setTab("carte")} style={tab === "carte" ? tabActive : tabInactive}>📋 Articles ({items.length})</button>
        <button onClick={() => setTab("supplements")} style={tab === "supplements" ? tabActive : tabInactive}>➕ Suppléments ({supplements.length})</button>
      </div>

      {loading ? <p>Chargement…</p> : tab === "carte" ? (
        // ── Liste des articles ──
        items.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#999" }}>
            <p style={{ fontSize: 18 }}>Votre carte est vide.</p>
            <button onClick={() => setEditingItem(emptyItem())} style={btnPrimary}>Ajouter votre premier article</button>
          </div>
        ) : byCategory.map(({ cat, items: catItems }) => (
          <div key={cat} style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, textTransform: "capitalize", marginBottom: 10, color: "#555" }}>{cat}s</h2>
            <div style={{ display: "grid", gap: 8 }}>
              {catItems.map(item => (
                <div key={item.id} style={{ border: "1px solid #eee", borderRadius: 14, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", opacity: item.available ? 1 : 0.5, background: item.available ? "#fff" : "#fafafa" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>
                      {item.name}
                      {!item.available && <span style={{ marginLeft: 8, fontSize: 11, color: "#e05", background: "#fff0f0", padding: "2px 7px", borderRadius: 99, border: "1px solid #fdd" }}>Indisponible</span>}
                    </div>
                    {item.description && <div style={{ fontSize: 13, color: "#777", marginTop: 2 }}>{item.description}</div>}
                    <div style={{ fontSize: 14, marginTop: 4, fontWeight: 600 }}>{item.price}€</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => toggleItem(item)} style={btnSmall}>{item.available ? "🔴 Rupture" : "🟢 Dispo"}</button>
                    <button onClick={() => setEditingItem({ ...item })} style={btnSmall}>✏️</button>
                    <button onClick={() => deleteItem(item)} style={{ ...btnSmall, color: "#c00" }}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        // ── Liste des suppléments ──
        supplements.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#999" }}>
            <p style={{ fontSize: 18 }}>Aucun supplément configuré.</p>
            <p style={{ fontSize: 14 }}>Ex: Mozzarella +1€, Champignons +0.50€, Olives +0.50€</p>
            <button onClick={() => setEditingSupplement(emptySupplement())} style={btnPrimary}>Ajouter votre premier supplément</button>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {supplements.map(s => (
              <div key={s.id} style={{ border: "1px solid #eee", borderRadius: 14, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", opacity: s.available ? 1 : 0.5 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>
                    {s.name}
                    {!s.available && <span style={{ marginLeft: 8, fontSize: 11, color: "#e05", background: "#fff0f0", padding: "2px 7px", borderRadius: 99, border: "1px solid #fdd" }}>Indisponible</span>}
                  </div>
                  <div style={{ fontSize: 14, marginTop: 4, fontWeight: 600, color: s.price > 0 ? "#333" : "#999" }}>
                    {s.price > 0 ? `+${s.price}€` : "Gratuit"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => toggleSupplement(s)} style={btnSmall}>{s.available ? "🔴 Indispo" : "🟢 Dispo"}</button>
                  <button onClick={() => setEditingSupplement({ ...s })} style={btnSmall}>✏️</button>
                  <button onClick={() => deleteSupplement(s)} style={{ ...btnSmall, color: "#c00" }}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Modal article */}
      {editingItem && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: 28, width: "100%", maxWidth: 440, display: "grid", gap: 14 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>{editingItem.id ? "Modifier" : "Ajouter"} un article</h2>
            <label style={labelStyle}>Catégorie
              <select value={editingItem.category} onChange={e => setEditingItem({ ...editingItem, category: e.target.value })} style={inputStyle}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label style={labelStyle}>Nom *
              <input value={editingItem.name} onChange={e => setEditingItem({ ...editingItem, name: e.target.value })} style={inputStyle} placeholder="Ex: Margherita" />
            </label>
            <label style={labelStyle}>Description (optionnel)
              <input value={editingItem.description ?? ""} onChange={e => setEditingItem({ ...editingItem, description: e.target.value })} style={inputStyle} placeholder="Ex: Tomate, mozzarella, basilic" />
            </label>
            <label style={labelStyle}>Prix (€)
              <input type="number" value={editingItem.price} onChange={e => setEditingItem({ ...editingItem, price: parseFloat(e.target.value) || 0 })} style={inputStyle} />
            </label>
            <label style={{ ...labelStyle, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <input type="checkbox" checked={editingItem.available} onChange={e => setEditingItem({ ...editingItem, available: e.target.checked })} />
              Disponible
            </label>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setEditingItem(null)} style={btnSecondary}>Annuler</button>
              <button onClick={saveItem} disabled={saving} style={btnPrimary}>{saving ? "…" : "Sauvegarder"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal supplément */}
      {editingSupplement && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: 28, width: "100%", maxWidth: 380, display: "grid", gap: 14 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>{editingSupplement.id ? "Modifier" : "Ajouter"} un supplément</h2>
            <label style={labelStyle}>Nom *
              <input value={editingSupplement.name} onChange={e => setEditingSupplement({ ...editingSupplement, name: e.target.value })} style={inputStyle} placeholder="Ex: Mozzarella supplémentaire" />
            </label>
            <label style={labelStyle}>Prix (€) — 0 si gratuit
              <input type="number" step="0.5" value={editingSupplement.price} onChange={e => setEditingSupplement({ ...editingSupplement, price: parseFloat(e.target.value) || 0 })} style={inputStyle} />
            </label>
            <label style={{ ...labelStyle, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <input type="checkbox" checked={editingSupplement.available} onChange={e => setEditingSupplement({ ...editingSupplement, available: e.target.checked })} />
              Disponible
            </label>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setEditingSupplement(null)} style={btnSecondary}>Annuler</button>
              <button onClick={saveSupplement} disabled={saving} style={btnPrimary}>{saving ? "…" : "Sauvegarder"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btnPrimary: React.CSSProperties = { padding: "10px 18px", borderRadius: 12, border: "none", background: "#111", color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 14 };
const btnSecondary: React.CSSProperties = { padding: "10px 18px", borderRadius: 12, border: "1px solid #ddd", background: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14 };
const btnSmall: React.CSSProperties = { padding: "6px 12px", borderRadius: 10, border: "1px solid #eee", background: "#fafafa", fontWeight: 700, cursor: "pointer", fontSize: 13 };
const inputStyle: React.CSSProperties = { padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14, width: "100%", boxSizing: "border-box" };
const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 5, fontSize: 13, fontWeight: 600, color: "#444" };
const tabActive: React.CSSProperties = { padding: "8px 16px", borderRadius: 10, border: "none", background: "#111", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14 };
const tabInactive: React.CSSProperties = { padding: "8px 16px", borderRadius: 10, border: "1px solid #eee", background: "#fafafa", fontWeight: 700, cursor: "pointer", fontSize: 14 };
