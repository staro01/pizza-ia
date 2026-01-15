import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type JsonMessage = {
  role?: string;
  content?: string;
  createdAt?: string;
};

function extractMessages(messages: unknown): JsonMessage[] {
  if (Array.isArray(messages)) return messages as JsonMessage[];
  return [];
}

export default async function Page({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : "";

  const conversations = await prisma.conversation.findMany({
    where: q
      ? {
          OR: [
            { externalId: { contains: q, mode: "insensitive" } },
            { id: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      externalId: true,
      createdAt: true,
      messages: true,
    },
  });

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Conversations (admin)</h1>

      <form
        style={{ display: "flex", gap: 12, marginTop: 16, alignItems: "center" }}
      >
        <input
          name="q"
          defaultValue={q}
          placeholder="Recherche id / externalId…"
          style={{
            padding: 10,
            width: 360,
            border: "1px solid #ccc",
            borderRadius: 10,
          }}
        />

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
          Rechercher
        </button>
      </form>

      <div style={{ marginTop: 18, borderTop: "1px solid #eee" }}>
        {conversations.map((c) => {
          const msgs = extractMessages(c.messages);
          const last = msgs.length ? msgs[msgs.length - 1] : null;
          const lastContent = typeof last?.content === "string" ? last.content : "";
          const count = msgs.length;

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

                <div style={{ fontSize: 12, color: "#666" }}>{count} msg</div>
              </div>

              <div style={{ marginTop: 8, color: "#333" }}>
                {last ? (
                  <>
                    <span style={{ fontSize: 12, color: "#666" }}>
                      Dernier ({last.role ?? "?"}) :
                    </span>{" "}
                    <span>
                      {lastContent.slice(0, 160)}
                      {lastContent.length > 160 ? "…" : ""}
                    </span>
                  </>
                ) : (
                  <span style={{ color: "#666" }}>Aucun message</span>
                )}
              </div>
            </Link>
          );
        })}

        {conversations.length === 0 ? (
          <div style={{ padding: 16, color: "#666" }}>Aucune conversation.</div>
        ) : null}
      </div>
    </div>
  );
}
