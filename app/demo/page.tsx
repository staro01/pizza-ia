export default function DemoPage() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 520, width: "100%", border: "1px solid #eee", borderRadius: 16, padding: 20 }}>
        <h1 style={{ fontSize: 26, marginBottom: 8 }}>Pizza IA — Démo</h1>
        <p style={{ opacity: 0.8, marginBottom: 16 }}>
          Choisis une vue pour simuler le client et le restaurant.
        </p>

        <div style={{ display: "grid", gap: 10 }}>
          <a
            href="/client"
            style={{
              display: "block",
              textAlign: "center",
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #ddd",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            👤 Vue Client (Chat)
          </a>

          <a
            href="/restaurant"
            style={{
              display: "block",
              textAlign: "center",
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #ddd",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            🍕 Vue Restaurant (Cuisine)
          </a>
        </div>

        <div style={{ marginTop: 16, fontSize: 13, opacity: 0.75 }}>
          Astuce : ouvre <b>/client</b> sur ton téléphone et <b>/restaurant</b> sur ton ordi.
        </div>
      </div>
    </div>
  );
}
