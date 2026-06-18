"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { EditorInsert } from "@/app/flow/shared";

interface FlowSpeechProps {
  flowId: string;
  initialBody: string;
  registerInsert: (fn: EditorInsert | null) => void;
  resolveSlashText?: (trigger: string) => string | null;
}

// One shared speech-writing doc per flow, bound to flows.speech_body. Both
// partners edit it; saved on blur, streamed via the flows row UPDATE event.
export default function FlowSpeech({ flowId, initialBody, registerInsert, resolveSlashText }: FlowSpeechProps) {
  const [body, setBody] = useState(initialBody);
  const editing = useRef(false);
  const elRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel(`flow_speech:${flowId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "flows", filter: `id=eq.${flowId}` },
        (payload) => {
          if (editing.current) return; // don't overwrite an in-progress edit
          const next = (payload.new as { speech_body: string }).speech_body;
          setBody((prev) => (prev === next ? prev : next));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [flowId]);

  async function save(text: string) {
    await supabase.from("flows").update({ speech_body: text }).eq("id", flowId);
  }

  function insert(text: string) {
    const el = elRef.current;
    const pos = el ? (el.selectionStart ?? body.length) : body.length;
    const next = body.slice(0, pos) + text + body.slice(pos);
    setBody(next);
    save(next);
  }

  function clearSpeech() {
    if (!body.trim()) return;
    if (!window.confirm("Clear the speech for everyone on this flow?")) return;
    setBody("");
    save("");
  }

  return (
    <div className="flow-speech">
      <div className="flow-speech__bar">
        <button className="db-btn db-btn--glass db-btn--sm" onClick={clearSpeech}>Clear speech</button>
      </div>
      <textarea
        ref={elRef}
        className="flow-speech__text"
        value={body}
        placeholder="Write your speech here — your partner can edit it too."
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          // Slash command: "/topshelf" alone on a line + Enter runs that extension.
          if (e.key === "Enter" && !e.shiftKey) {
            const ta = e.target as HTMLTextAreaElement;
            const pos = ta.selectionStart ?? 0;
            const lineStart = ta.value.lastIndexOf("\n", pos - 1) + 1;
            const m = /^\/(\S+)$/.exec(ta.value.slice(lineStart, pos).trim());
            if (m) {
              const text = resolveSlashText?.(m[1].toLowerCase());
              if (text != null) {
                e.preventDefault();
                const next = ta.value.slice(0, lineStart) + text + ta.value.slice(pos);
                setBody(next);
                save(next);
              }
            }
          }
        }}
        onFocus={() => { editing.current = true; registerInsert(insert); }}
        onBlur={(e) => { editing.current = false; save(e.target.value); }}
      />
    </div>
  );
}
