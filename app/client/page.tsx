"use client";

import { useEffect, useRef, useState } from "react";

const CHAT_ENDPOINT = "/api/chat"; // <-- change si ton endpoint est différent

type Role = "user" | "assistant";
type Msg = { role: Role; text: string };

export default function ClientChatPage() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", text: "Bonjour 👋 Quelle pizza souhaitez-vous ?" },
  ]);
  const [input, setInput] = useState("");
  const [order, setOrder] = useState<any>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, order, stage }),
      });

      const data = await res.json();

      // Le bot renvoie soit next_question, soit summary/message
      const botText =
        data?.next_question ||
        data?.summary ||
        data?.message ||
        "OK.";

      setMessages((m) => [...m, { role: "assistant", text: botText }]);
      setOrder(data?.order ?? order);
      setStage(data?.stage ?? null);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "Oups, erreur serveur. Réessaie." },
      ]);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") send();
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", gridTemplateRows: "auto 1fr auto" }}>
      <header style={{ padding: 14, borderBottom: "1px solid #eee" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 800 }}>👤 Client — Chat</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Simule une commande comme un client.</div>
          </div>
          <a href="/demo" style={{ textDecoration: "none", opacity: 0.8 }}>← Démo</a>
        </div>
      </header>

      <main style={{ padding: 14 }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: 10 }}>
          {messages.map((m, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                justifyContent: m.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              <div
                style={{
                  maxWidth: 520,
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid #eee",
                  background: m.role === "user" ? "#f7f7f7" : "white",
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.text}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </main>

      <footer style={{ padding: 14, borderTop: "1px solid #eee" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", gap: 10 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder='Ex: "Je veux une reine"'
            style={{
              flex: 1,
              padding: "12px 12px",
              borderRadius: 12,
              border: "1px solid #ddd",
              outline: "none",
            }}
          />
          <button
            onClick={send}
            disabled={sending}
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #ddd",
              fontWeight: 800,
              cursor: sending ? "not-allowed" : "pointer",
            }}
          >
            {sending ? "…" : "Envoyer"}
          </button>
        </div>
      </footer>
    </div>
  );
}
