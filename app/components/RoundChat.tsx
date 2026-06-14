"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

interface Msg {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

interface RoundChatProps {
  roundId: string;
  userId: string;
  names: Record<string, string>; // user_id → display name
}

// Private live chat between the two debaters in a round. Backed by the
// `round_messages` table + Supabase Realtime (see the SQL handed over with
// this feature). RLS limits read/write to the round's pro and con.
export default function RoundChat({ roundId, userId, names }: RoundChatProps) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // Initial history + live updates.
  useEffect(() => {
    let active = true;
    supabase
      .from("round_messages")
      .select("id, sender_id, body, created_at")
      .eq("round_id", roundId)
      .order("created_at", { ascending: true })
      .then(({ data }) => { if (active && data) setMessages(data as Msg[]); });

    const channel = supabase
      .channel(`round_messages:${roundId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "round_messages", filter: `round_id=eq.${roundId}` },
        (payload) => {
          const m = payload.new as Msg;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        }
      )
      .subscribe();

    return () => { active = false; supabase.removeChannel(channel); };
  }, [roundId]);

  // Pin the scroll to the newest message.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send() {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    const { data, error: err } = await supabase
      .from("round_messages")
      .insert({ round_id: roundId, sender_id: userId, body: text })
      .select("id, sender_id, body, created_at")
      .single();
    setSending(false);
    if (err) { setError(err.message); return; }
    setBody("");
    if (data) setMessages((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data as Msg]));
  }

  return (
    <div className="rc">
      <style>{`
        .rc__list { display: flex; flex-direction: column; gap: 10px; max-height: 340px; overflow-y: auto; padding: 4px 2px 2px; }
        .rc__empty { font-size: 13px; color: rgba(255,255,255,0.40); text-align: center; padding: 24px 0; text-shadow: 0 1px 5px rgba(0,0,0,0.35); }
        .rc__row { display: flex; flex-direction: column; max-width: 80%; }
        .rc__row--me { align-self: flex-end; align-items: flex-end; }
        .rc__row--them { align-self: flex-start; align-items: flex-start; }
        .rc__who { font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.10em; text-transform: uppercase; color: rgba(255,255,255,0.35); margin: 0 0 3px; }
        .rc__bubble { font-size: 14px; line-height: 1.45; padding: 8px 12px; border-radius: 12px; word-break: break-word; white-space: pre-wrap; }
        .rc__row--me .rc__bubble { background: var(--accent); color: var(--accent-ink); border-bottom-right-radius: 4px; }
        .rc__row--them .rc__bubble { background: rgba(255,255,255,0.10); color: #fff; border: 1px solid rgba(255,255,255,0.10); border-bottom-left-radius: 4px; }
        .rc__time { font-family: var(--font-mono); font-size: 9px; color: rgba(255,255,255,0.28); margin: 3px 2px 0; }
        .rc__form { display: flex; gap: 10px; margin-top: 14px; }
      `}</style>

      <div className="rc__list" ref={listRef}>
        {messages.length === 0 ? (
          <p className="rc__empty">No messages yet — say hello to your opponent.</p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === userId;
            return (
              <div key={m.id} className={`rc__row ${mine ? "rc__row--me" : "rc__row--them"}`}>
                {!mine && <p className="rc__who">{names[m.sender_id] ?? "Opponent"}</p>}
                <div className="rc__bubble">{m.body}</div>
                <span className="rc__time">
                  {new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
            );
          })
        )}
      </div>

      {error && <p style={{ fontSize: 12, color: "oklch(0.70 0.20 28)", margin: "10px 0 0" }}>⚑ {error}</p>}

      <div className="rc__form">
        <input
          className="lp-input"
          value={body}
          maxLength={2000}
          placeholder="Message your opponent…"
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          style={{ flex: 1 }}
        />
        <button
          onClick={send}
          disabled={sending || !body.trim()}
          className="db-btn db-btn--accent"
          style={{ flexShrink: 0, height: 46, padding: "0 20px" }}
        >
          {sending ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
