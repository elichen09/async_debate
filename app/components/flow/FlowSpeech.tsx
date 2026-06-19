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
// partners edit it: changes autosave ~0.4s after the last keystroke and stream via
// the flows row UPDATE event, so neither side has to refresh. We re-read the latest
// body on mount (initialBody goes stale once you tab away and back) and ignore
// incoming events for ~1.5s after your own typing so the cursor never jumps.
export default function FlowSpeech({ flowId, initialBody, registerInsert, resolveSlashText }: FlowSpeechProps) {
  const [body, setBody] = useState(initialBody);
  const lastTyped = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(initialBody);     // newest text, for flush-on-unmount
  const dirty = useRef(false);            // unsaved local edits pending
  const elRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let active = true;
    // Re-pull the current body — initialBody can be stale after a tab switch.
    supabase.from("flows").select("speech_body").eq("id", flowId).single().then(({ data }) => {
      if (!active || !data) return;
      if (Date.now() - lastTyped.current < 1500) return;
      const next = (data as { speech_body: string }).speech_body ?? "";
      setBody((prev) => (prev === next ? prev : next));
    });

    const channel = supabase
      .channel(`flow_speech:${flowId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "flows", filter: `id=eq.${flowId}` },
        (payload) => {
          if (Date.now() - lastTyped.current < 1500) return; // don't clobber a live edit
          const next = (payload.new as { speech_body: string }).speech_body;
          setBody((prev) => (prev === next ? prev : next));
        }
      )
      .subscribe();
    return () => {
      active = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (dirty.current) supabase.from("flows").update({ speech_body: latest.current }).eq("id", flowId).then(() => {}); // flush (then() to actually send)
      supabase.removeChannel(channel);
    };
  }, [flowId]);

  async function save(text: string) {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    dirty.current = false;
    await supabase.from("flows").update({ speech_body: text }).eq("id", flowId);
  }

  // Mark a local edit and autosave shortly after typing stops.
  function edit(text: string) {
    setBody(text);
    latest.current = text;
    dirty.current = true;
    lastTyped.current = Date.now();
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(text), 400);
  }

  function insert(text: string) {
    const el = elRef.current;
    const pos = el ? (el.selectionStart ?? body.length) : body.length;
    edit(body.slice(0, pos) + text + body.slice(pos));
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
        onChange={(e) => edit(e.target.value)}
        onKeyDown={(e) => {
          // Slash command: "/topshelf" alone on a line + Enter inserts its tags.
          if (e.key === "Enter" && !e.shiftKey) {
            const ta = e.target as HTMLTextAreaElement;
            const pos = ta.selectionStart ?? 0;
            const lineStart = ta.value.lastIndexOf("\n", pos - 1) + 1;
            const m = /^\/(\S+)$/.exec(ta.value.slice(lineStart, pos).trim());
            if (m) {
              const text = resolveSlashText?.(m[1].toLowerCase());
              if (text != null) {
                e.preventDefault();
                edit(ta.value.slice(0, lineStart) + text + ta.value.slice(pos));
              }
            }
          }
        }}
        onFocus={() => { registerInsert(insert); }}
        onBlur={(e) => { save(e.target.value); }}
      />
    </div>
  );
}
