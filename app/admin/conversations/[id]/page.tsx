import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

type ConversationStatusType = "active" | "completed" | "cancelled";

async function getConversation(id: string) {
  return prisma.conversation.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}

async function setStatusAction(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as ConversationStatusType;
  if (!id) return;

  await prisma.conversation.update({
    where: { id },
    data: {
      status: status as any, // Prisma enum ou string selon ton schema
      cancelledAt: status === "cancelled" ? new Date() : null,
    },
  });

  revalidatePath(`/admin/conversations/${id}`);
  revalidatePath(`/admin/conversations`);
}

async function resetFailCountAction(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await prisma.conversation.update({
    where: { id },
    data: { failCount: 0 },
  });

  revalidatePath(`/admin/conversations/${id}`);
  revalidatePath(`/admin/conversations`);
}

export default async function Page({ params }: { params: { id: string } }) {
  const { id } = params;

  const conversation = await getConversation(id);

  if (!conversation) {
    return (
      <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
        <Link
          href="/admin/conversations"
          style={{ color: "#555", textDecoration: "none" }}
        >
          ← Retour
        </Link>
        <h1 style={{ marginTop: 12 }}>Conversation introuvable</h1>
        <p style={{ color: "#666" }}>L’ID n’existe pas (ou a été supprimé).</p>
      </div>
    );
  }

  const events = await prisma.twilioEvent.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <Link
            href="/admin/conversations"
            style={{ color: "#555", textDecoration: "none" }}
          >
            ← Retour
          </Link>

          <h1 style={{ fontSize: 26, fontWeight: 750, marginTop: 8 }}>
            {conversation.externalId ?? "Conversation"}
          </h1>

          <div style={{ color: "#666", marginTop: 6 }}>
            {new Date(conversation.createdAt).toLocaleString()} • status:{" "}
            <b>{conversation.status as any}</b> • failCount:{" "}
            <b>{conversation.failCount}</b>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <form action={setStatusAction}>
            <input type="hidden" name="id" value={conversation.id} />
            <input type="hidden" name="status" value="active" />
            <button style={btnStyle} type="submit">
              Activer
            </button>
          </form>

          <form action={setStatusAction}>
            <input type="hidden" name="id" value={conversation.id} />
            <input type="hidden" name="status" value="completed" />
            <button style={btnStyle} type="submit">
              Terminer
            </button>
          </form>

          <form action={setStatusAction}>
            <input type="hidden" name="id" value={conversation.id} />
            <input type="hidden" name="status" value="cancelled" />
            <button style={btnStyle} type="submit">
              Annuler
            </button>
          </form>

          <form action={resetFailCountAction}>
            <input type="hidden" name="id" value={conversation.id} />
            <button style={btnStyleGhost} type="submit">
              Reset fail
            </button>
          </form>
        </div>
      </div>

      {/* Logs Twilio */}
      <div style={{ marginTop: 18, borderTop: "1px solid #eee", paddingTop: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Logs Twilio</h2>

        {events.length === 0 ? (
          <div style={{ color: "#666", marginTop: 8 }}>
            Aucun log Twilio pour l’instant.
          </div>
        ) : (
          <div style={{ marginTop: 10 }}>
            {events.map((e) => (
              <div
                key={e.id}
                style={{
                  padding: 10,
                  border: "1px solid #ddd",
                  borderRadius: 12,
                  marginBottom: 8,
                  background: "#fafafa",
                  fontSize: 13,
                }}
              >
                <b>{e.eventType}</b> • {new Date(e.createdAt).toLocaleString()}
                <div style={{ color: "#444", marginTop: 4 }}>
                  status={e.callStatus ?? "-"} • from={e.from ?? "-"} • to=
                  {e.to ?? "-"} • duration={e.duration ?? "-"}s
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div style={{ marginTop: 18, borderTop: "1px solid #eee", paddingTop: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Messages</h2>

        <div style={{ marginTop: 10 }}>
          {conversation.messages.map((m) => (
            <div key={m.id} style={{ display: "flex", gap: 12, marginBottom: 12 }}>
              <div style={{ width: 90, fontSize: 12, color: "#666" }}>
                {new Date(m.createdAt).toLocaleTimeString()}
                <div style={{ marginTop: 6, fontWeight: 700 }}>{m.role}</div>
              </div>

              <div
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  background: m.role === "assistant" ? "#fafafa" : "#fff",
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.content}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #000",
  background: "#000",
  color: "#fff",
  cursor: "pointer",
};

const btnStyleGhost: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "#fff",
  color: "#111",
  cursor: "pointer",
};
