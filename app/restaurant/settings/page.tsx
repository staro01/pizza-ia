"use client";

import { useEffect, useState } from "react";

const DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

type DaySchedule = { open: string; close: string; dinnerOpen: string; dinnerClose: string; closed: boolean };
type Settings = {
  name: string; phone: string; address: string;
  estimatedPrepTime: number;
  deliveryEnabled: boolean; deliveryFee: number; deliveryMinimum: number;
  paymentMethods: string;
  vacationMode: boolean; vacationMessage: string;
  allergensInfo: string; currentPromos: string; welcomeMessage: string;
  openingHours: Record<string, DaySchedule>;
};

const defaultDay = (): DaySchedule => ({ open: "11:30", close: "14:00", dinnerOpen: "19:00", dinnerClose: "22:30", closed: false });
const defaultSettings = (): Settings => ({
  name: "", phone: "", address: "",
  estimatedPrepTime: 20,
  deliveryEnabled: true, deliveryFee: 0, deliveryMinimum: 0,
  paymentMethods: "CB, espèces",
  vacationMode: false, vacationMessage: "Le restaurant est actuellement fermé. Merci de rappeler.",
  allergensInfo: "", currentPromos: "", welcomeMessage: "",
  openingHours: Object.fromEntries(DAYS.map(d => [d, defaultDay()])),
});

export default function SettingsPage() {
  const [s, setS] = useState<Settings>(defaultSettings());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/restaurant/settings").then(r => r.json()).then(data => {
      if (data) setS({ ...defaultSettings(), ...data, openingHours: { ...defaultSettings().openingHours, ...(data.openingHours ?? {}) } });
      setLoading(false);
    });
  }, []);

  async function save() {
    setSaving(true);
    await fetch("/api/restaurant/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function setDay(day: string, field: keyof DaySchedule, value: string | boolean) {
    setS(prev => ({ ...prev, openingHours: { ...prev.openingHours, [day]: { ...prev.openingHours[day], [field]: value } } }));
  }

  if (loading) return <p>Chargement…</p>;

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>⚙️ Mon restaurant</h1>
        <button onClick={save} disabled={saving} style={btnPrimary}>
          {saving ? "Sauvegarde…" : saved ? "✅ Sauvegardé !" : "Sauvegarder"}
        </button>
      </div>

      <Section title="🏠 Informations générales">
        <Field label="Nom du restaurant"><input value={s.name} onChange={e => setS({ ...s, name: e.target.value })} style={inputStyle} /></Field>
        <Field label="Téléphone"><input value={s.phone} onChange={e => setS({ ...s, phone: e.target.value })} style={inputStyle} placeholder="04 90 XX XX XX" /></Field>
        <Field label="Adresse"><input value={s.address} onChange={e => setS({ ...s, address: e.target.value })} style={inputStyle} /></Field>
      </Section>

      <Section title="🚗 Commandes & livraison">
        <Toggle label="Livraison activée" checked={s.deliveryEnabled} onChange={v => setS({ ...s, deliveryEnabled: v })} />
        {s.deliveryEnabled && <>
          <Field label="Frais de livraison (€)"><input type="number" value={s.deliveryFee} onChange={e => setS({ ...s, deliveryFee: parseFloat(e.target.value) || 0 })} style={inputStyle} /></Field>
          <Field label="Commande minimum (€)"><input type="number" value={s.deliveryMinimum} onChange={e => setS({ ...s, deliveryMinimum: parseFloat(e.target.value) || 0 })} style={inputStyle} /></Field>
        </>}
        <Field label="Temps de préparation estimé (min)"><input type="number" value={s.estimatedPrepTime} onChange={e => setS({ ...s, estimatedPrepTime: parseInt(e.target.value) || 20 })} style={inputStyle} /></Field>
        <Field label="Moyens de paiement"><input value={s.paymentMethods} onChange={e => setS({ ...s, paymentMethods: e.target.value })} style={inputStyle} /></Field>
      </Section>

      <Section title="🏖️ Mode vacances">
        <Toggle label="Activer le mode vacances" checked={s.vacationMode} onChange={v => setS({ ...s, vacationMode: v })} />
        {s.vacationMode && <Field label="Message pour les clients"><textarea value={s.vacationMessage} onChange={e => setS({ ...s, vacationMessage: e.target.value })} style={{ ...inputStyle, minHeight: 70 }} /></Field>}
      </Section>

      <Section title="🕐 Horaires d'ouverture">
        <div style={{ display: "grid", gap: 10 }}>
          {DAYS.map(day => (
            <div key={day} style={{ display: "grid", gridTemplateColumns: "100px 1fr", alignItems: "center", gap: 10 }}>
              <label style={{ fontWeight: 700, fontSize: 13, textTransform: "capitalize", display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={!s.openingHours[day]?.closed} onChange={e => setDay(day, "closed", !e.target.checked)} />
                {day}
              </label>
              {!s.openingHours[day]?.closed ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, flexWrap: "wrap" }}>
                  <input type="time" value={s.openingHours[day]?.open} onChange={e => setDay(day, "open", e.target.value)} style={timeInput} />
                  <span>–</span>
                  <input type="time" value={s.openingHours[day]?.close} onChange={e => setDay(day, "close", e.target.value)} style={timeInput} />
                  <span style={{ color: "#bbb" }}>|</span>
                  <input type="time" value={s.openingHours[day]?.dinnerOpen} onChange={e => setDay(day, "dinnerOpen", e.target.value)} style={timeInput} />
                  <span>–</span>
                  <input type="time" value={s.openingHours[day]?.dinnerClose} onChange={e => setDay(day, "dinnerClose", e.target.value)} style={timeInput} />
                </div>
              ) : <span style={{ fontSize: 13, color: "#999" }}>Fermé</span>}
            </div>
          ))}
        </div>
      </Section>

      <Section title="🤖 Infos pour l'IA">
        <Field label="Message d'accueil personnalisé"><input value={s.welcomeMessage} onChange={e => setS({ ...s, welcomeMessage: e.target.value })} style={inputStyle} placeholder="Ex: Bonjour, ici la Bella Pizza !" /></Field>
        <Field label="Promotions en cours"><textarea value={s.currentPromos} onChange={e => setS({ ...s, currentPromos: e.target.value })} style={{ ...inputStyle, minHeight: 60 }} placeholder="Ex: -10% sur toutes les pizzas le midi" /></Field>
        <Field label="Informations allergènes"><textarea value={s.allergensInfo} onChange={e => setS({ ...s, allergensInfo: e.target.value })} style={{ ...inputStyle, minHeight: 60 }} placeholder="Ex: Toutes nos pizzas contiennent du gluten." /></Field>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24, border: "1px solid #eee", borderRadius: 16, padding: 20 }}>
      <h2 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 800 }}>{title}</h2>
      <div style={{ display: "grid", gap: 12 }}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 5, fontSize: 13, fontWeight: 600, color: "#444" }}>
      {label}{children}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

const btnPrimary: React.CSSProperties = { padding: "10px 18px", borderRadius: 12, border: "none", background: "#111", color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 14 };
const inputStyle: React.CSSProperties = { padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14, width: "100%", boxSizing: "border-box" };
const timeInput: React.CSSProperties = { padding: "6px 8px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13 };
