"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STEPS = ["Bienvenue", "Votre restaurant", "Votre carte", "C'est prêt !"];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  // Step 2
  const [items, setItems] = useState([
    { name: "", price: "", category: "pizza" },
  ]);

  async function saveRestaurant() {
    if (!name.trim()) return alert("Le nom du restaurant est obligatoire.");
    setSaving(true);
    await fetch("/api/restaurant/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, address }),
    });
    setSaving(false);
    setStep(2);
  }

  async function saveMenu() {
    const valid = items.filter(i => i.name.trim() && parseFloat(i.price) > 0);
    if (valid.length === 0) return alert("Ajoutez au moins un article avec un nom et un prix.");
    setSaving(true);
    for (const item of valid) {
      await fetch("/api/restaurant/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: item.name, price: parseFloat(item.price), category: item.category, available: true }),
      });
    }
    setSaving(false);
    setStep(3);
  }

  function addItem() {
    setItems([...items, { name: "", price: "", category: "pizza" }]);
  }

  function updateItem(idx: number, field: string, value: string) {
    setItems(items.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  }

  function removeItem(idx: number) {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== idx));
  }

  return (
    <div style={{ minHeight: "100vh", background: "#fafafa", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 520, background: "#fff", borderRadius: 24, padding: 36, boxShadow: "0 2px 20px rgba(0,0,0,0.08)" }}>

        {/* Progress */}
        <div style={{ display: "flex", gap: 6, marginBottom: 32 }}>
          {STEPS.map((s, i) => (
            <div key={i} style={{ flex: 1, height: 4, borderRadius: 99, background: i <= step ? "#111" : "#eee", transition: "background 0.3s" }} />
          ))}
        </div>

        {/* Step 0 — Bienvenue */}
        {step === 0 && (
          <div>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🍕</div>
            <h1 style={{ fontSize: 24, fontWeight: 900, margin: "0 0 12px" }}>Bienvenue sur Pizza IA !</h1>
            <p style={{ color: "#666", lineHeight: 1.6, margin: "0 0 24px" }}>
              En 2 minutes, vous allez configurer votre assistant vocal qui prendra les commandes à votre place, 7j/7.
            </p>
            <div style={{ background: "#f5f5f5", borderRadius: 14, padding: 16, marginBottom: 28 }}>
              <p style={{ margin: 0, fontSize: 14, color: "#555", lineHeight: 1.6 }}>
                ✅ Votre nom et vos infos<br />
                ✅ Votre carte (pizzas, boissons, desserts)<br />
                ✅ Et c'est tout — votre IA est prête !
              </p>
            </div>
            <button onClick={() => setStep(1)} style={btnPrimary}>Commencer →</button>
          </div>
        )}

        {/* Step 1 — Infos restaurant */}
        {step === 1 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 6px" }}>Votre restaurant</h2>
            <p style={{ color: "#888", fontSize: 14, margin: "0 0 24px" }}>Ces infos seront utilisées par votre assistant vocal.</p>

            <div style={{ display: "grid", gap: 14 }}>
              <label style={labelStyle}>
                Nom du restaurant *
                <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="Ex: La Bella Pizza" />
              </label>
              <label style={labelStyle}>
                Téléphone (affiché si problème)
                <input value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} placeholder="04 90 XX XX XX" />
              </label>
              <label style={labelStyle}>
                Adresse
                <input value={address} onChange={e => setAddress(e.target.value)} style={inputStyle} placeholder="12 rue de la Paix, Avignon" />
              </label>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
              <button onClick={() => setStep(0)} style={btnSecondary}>← Retour</button>
              <button onClick={saveRestaurant} disabled={saving} style={btnPrimary}>{saving ? "Sauvegarde…" : "Continuer →"}</button>
            </div>
          </div>
        )}

        {/* Step 2 — Carte */}
        {step === 2 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 6px" }}>Votre carte</h2>
            <p style={{ color: "#888", fontSize: 14, margin: "0 0 20px" }}>Ajoutez vos articles. Vous pourrez en ajouter d'autres plus tard.</p>

            <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
              {items.map((item, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 80px 90px 32px", gap: 8, alignItems: "center" }}>
                  <input value={item.name} onChange={e => updateItem(idx, "name", e.target.value)} style={inputStyle} placeholder="Nom (ex: Margherita)" />
                  <input type="number" value={item.price} onChange={e => updateItem(idx, "price", e.target.value)} style={inputStyle} placeholder="Prix €" />
                  <select value={item.category} onChange={e => updateItem(idx, "category", e.target.value)} style={inputStyle}>
                    <option value="pizza">Pizza</option>
                    <option value="boisson">Boisson</option>
                    <option value="dessert">Dessert</option>
                    <option value="entrée">Entrée</option>
                  </select>
                  <button onClick={() => removeItem(idx)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#ccc" }}>✕</button>
                </div>
              ))}
            </div>

            <button onClick={addItem} style={{ ...btnSecondary, fontSize: 13, padding: "7px 14px", marginBottom: 24 }}>+ Ajouter un article</button>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep(1)} style={btnSecondary}>← Retour</button>
              <button onClick={saveMenu} disabled={saving} style={btnPrimary}>{saving ? "Sauvegarde…" : "Terminer →"}</button>
            </div>
          </div>
        )}

        {/* Step 3 — Terminé */}
        {step === 3 && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
            <h2 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 12px" }}>Votre assistant est prêt !</h2>
            <p style={{ color: "#666", lineHeight: 1.6, margin: "0 0 28px" }}>
              Votre carte et vos infos sont configurées. Votre assistant vocal peut maintenant prendre les commandes.
            </p>
            <button onClick={() => router.push("/restaurant")} style={btnPrimary}>Accéder à mon dashboard →</button>
          </div>
        )}

      </div>
    </div>
  );
}

const btnPrimary: React.CSSProperties = { padding: "12px 22px", borderRadius: 12, border: "none", background: "#111", color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 15, width: "100%" };
const btnSecondary: React.CSSProperties = { padding: "12px 22px", borderRadius: 12, border: "1px solid #ddd", background: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 15 };
const inputStyle: React.CSSProperties = { padding: "9px 12px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14, width: "100%", boxSizing: "border-box" };
const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 5, fontSize: 13, fontWeight: 600, color: "#444" };
