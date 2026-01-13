import Link from "next/link";
import { headers } from "next/headers";

type ConversationStatus = "active" | "completed" | "cancelled";

async function getBaseUrl() {
  const h = await headers(); // ✅ Next 16: headers() est async
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

async function getData(searchParams: Record<string, string | string[] | undefined>) {
  const q = typeof searchParams.q === "string" ? searchParams.q : "";
  const status = typeof searchParams.status === "string" ? searchParams.status : "all";

  const base = await getBaseUrl();

  const res = await fetch(
    `${base}/api/admin/conversations?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`,
    { cache: "no-store" }
  );

  if (!res.ok) throw new Error("Failed to load conversations");

  return res.json() as Promise<{
    conversations: Array<{
      id: string;
      externalId: string | null;
      createdAt: string;
      status: ConversationStatus;
      failCount: number;
      cancelledAt: string | null;
      _count: { messages: number };
      messages: Array<{ content: string; role: "user" | "assistant"; createdAt: string }>;
    }>;
  }>;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const data = await getData(searchParams);

  const q = typeof searchParams.q === "string" ? searchParams.q : "";
  const status = typeof searchParams.status === "string" ? searchParams.status : "all";

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Conversations (restaurant)</h1>

      <form style={{ display: "flex", gap: 12, marginTop: 16, alignItems: "center" }}>
        <input
          name="q"
          defaultValue={q}
          placeholder="Recherche CallSid / externalId…"
          style={{ padding: 10, width: 320, border: "1px solid #ccc", borderRadius: 10 }}
        />

        <select
          name="status"
          defaultValue={status}
          style={{ padding: 10, border: "1px solid #ccc", borderRadius: 10 }}
        >
          <option value="all">Tous</option>
          <option value="active">Actives</option>
          <option value="completed">Terminées</option>
          <option value="cancelled">Annulées</option>
        </select>

        <button
          type="submit"
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #000",
            background: "#000",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Filtrer
        </button>
      </form>

      <div style={{ marginTop: 18, borderTop: "1px solid #eee" }}>
        {data.conversations.map((c) => {
          const last = c.messages?.[0];
          return (
            <Link
              key={c.id}
              href={`/admin/conversations/${c.id}`}
              style={{
                display: "block",
                padding: 14,
                borderBottom: "1px solid #eee",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontWeight: 650 }}>
                  {c.externalId ?? "(sans externalId)"}{" "}
                  <span style={{ fontWeight: 400, color: "#666" }}>
                    • {new Date(c.createdAt).toLocaleString()}
                  </span>
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      border: "1px solid #ddd",
                      fontSize: 12,
                    }}
                  >
                    {c.status}
                  </span>
                  <span style={{ fontSize: 12, color: "#666" }}>
                    {c._count.messages} msg • fail {c.failCount}
                  </span>
                </div>
              </div>

              <div style={{ marginTop: 8, color: "#333" }}>
                {last ? (
                  <>
                    <span style={{ fontSize: 12, color: "#666" }}>
                      Dernier ({last.role}) :
                    </span>{" "}
                    <span>
                      {last.content.slice(0, 160)}
                      {last.content.length > 160 ? "…" : ""}
                    </span>
                  </>
                ) : (
                  <span style={{ color: "#666" }}>Aucun message</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
