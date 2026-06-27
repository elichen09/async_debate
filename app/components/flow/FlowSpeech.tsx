"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { enqueueUpdate } from "@/lib/flowSync";
import { fuzzyRank } from "@/lib/fuzzy";
import { usePanePresence } from "@/lib/presence";
import { caretOffsetIn } from "@/lib/caret";
import { useConfirm } from "@/app/components/flow/ConfirmProvider";
import RemoteCarets from "@/app/components/flow/RemoteCarets";
import { SlashList } from "@/app/components/flow/SlashMenu";
import { FLOW_DRAG_MIME, type EditorInsert, type SlashOption } from "@/app/flow/shared";

interface FlowSpeechProps {
  flowId: string;
  initialBody: string;
  registerInsert: (fn: EditorInsert | null) => void;
  resolveSlashText?: (trigger: string) => string | null;
  slashOptions?: SlashOption[];
  userId?: string;
  userName?: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
// Stored speech bodies used to be plain text; render those as HTML (newlines →
// <br>) so old speeches still show. Anything already containing a tag is HTML.
function toHtml(stored: string): string {
  if (!stored) return "";
  return /<[a-z!/][\s\S]*>/i.test(stored) ? stored : escapeHtml(stored).replace(/\n/g, "<br>");
}

// One shared speech-writing doc per flow, bound to flows.speech_body. It's a rich
// contentEditable so a flow pasted from the Flow tab keeps its indent colors, and
// pasted cards keep their formatting. Both partners edit it: changes autosave
// ~0.4s after the last keystroke and stream via the flows row UPDATE event, so
// neither side has to refresh. Uncontrolled (innerHTML set only on external
// updates) so typing never loses the caret; incoming events are ignored for ~1.5s
// after your own typing.
export default function FlowSpeech({ flowId, initialBody, registerInsert, resolveSlashText, slashOptions = [], userId = "", userName = "Partner" }: FlowSpeechProps) {
  const ref = useRef<HTMLDivElement>(null);
  const confirm = useConfirm();
  const [focused, setFocused] = useState(false);
  const [myCaret, setMyCaret] = useState<number | null>(null);
  const others = usePanePresence(flowId, "speech", userId, userName, focused, focused ? myCaret : null);
  const trackCaret = () => { const el = ref.current; if (!el) return; const off = caretOffsetIn(el); setMyCaret((prev) => (off === prev ? prev : off)); };

  // Track the caret reliably while focused (selectionchange fires for typing,
  // arrows, and clicks — onFocus alone can run before the caret is placed).
  useEffect(() => {
    if (!focused) return;
    const read = () => { const el = ref.current; if (!el) return; const off = caretOffsetIn(el); setMyCaret((prev) => (off === prev ? prev : off)); };
    read();
    document.addEventListener("selectionchange", read);
    return () => document.removeEventListener("selectionchange", read);
  }, [focused]);
  const lastTyped = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef("");      // newest HTML, for flush-on-unmount
  const dirty = useRef(false);    // unsaved local edits pending
  // Slash autocomplete: the partial "/trigger" being typed at the caret + its
  // screen position, mirroring the Flow outline's dropdown.
  const [slash, setSlash] = useState<{ query: string; top: number; left: number } | null>(null);
  const [slashActive, setSlashActive] = useState(0);

  // Apply a body that came from the server, unless it matches what's shown.
  function applyExternal(stored: string) {
    const el = ref.current;
    if (!el) return;
    const html = toHtml(stored);
    if (el.innerHTML === html) return;
    el.innerHTML = html;
    latest.current = html;
  }

  useEffect(() => {
    const el = ref.current;
    if (el) { el.innerHTML = toHtml(initialBody); latest.current = el.innerHTML; }
    let active = true;
    // Re-pull the current body — initialBody can be stale after a tab switch.
    supabase.from("flows").select("speech_body").eq("id", flowId).single().then(({ data }) => {
      if (!active || !data) return;
      if (Date.now() - lastTyped.current < 1500) return;
      applyExternal((data as { speech_body: string }).speech_body ?? "");
    });

    const channel = supabase
      .channel(`flow_speech:${flowId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "flows", filter: `id=eq.${flowId}` },
        (payload) => {
          if (Date.now() - lastTyped.current < 1500) return; // don't clobber a live edit
          applyExternal((payload.new as { speech_body: string }).speech_body ?? "");
        }
      )
      .subscribe();
    return () => {
      active = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (dirty.current) enqueueUpdate("flows", flowId, { speech_body: latest.current }); // flush to the offline outbox
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId]);

  function save(html: string) {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    dirty.current = false;
    enqueueUpdate("flows", flowId, { speech_body: html });
  }

  // Mark a local edit and autosave on a steady cadence *while* typing (throttle, not
  // debounce) so a partner sees text stream in — not just after you pause.
  function onInput() {
    const html = ref.current?.innerHTML ?? "";
    latest.current = html;
    dirty.current = true;
    lastTyped.current = Date.now();
    if (saveTimer.current) return;
    saveTimer.current = setTimeout(() => { saveTimer.current = null; save(latest.current); }, 200);
  }

  // A flow point dragged from a Flow pane: drop it into the speech at the cursor,
  // keeping the outline's indent colors (the HTML the Flow pane put on the drag).
  function onDropPoint(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes(FLOW_DRAG_MIME)) return;
    e.preventDefault();
    const el = ref.current;
    if (!el) return;
    const html = e.dataTransfer.getData("text/html");
    const text = e.dataTransfer.getData("text/plain");
    const d = document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    };
    let range: Range | null = d.caretRangeFromPoint?.(e.clientX, e.clientY) ?? null;
    if (!range && d.caretPositionFromPoint) {
      const pos = d.caretPositionFromPoint(e.clientX, e.clientY);
      if (pos) { range = document.createRange(); range.setStart(pos.offsetNode, pos.offset); range.collapse(true); }
    }
    el.focus();
    const sel = window.getSelection();
    if (range && sel) { sel.removeAllRanges(); sel.addRange(range); }
    if (html) document.execCommand("insertHTML", false, html);
    else if (text) document.execCommand("insertText", false, text);
    onInput();
  }

  function insert(text: string) {
    const el = ref.current;
    if (!el) return;
    el.focus();
    document.execCommand("insertText", false, text);
    onInput();
  }

  // After a keystroke, see if the caret sits at the end of a "/partial" token; if
  // so, show the dropdown at the caret, else hide it.
  function updateSlash() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) { setSlash(null); return; }
    const node = sel.anchorNode;
    if (!node || node.nodeType !== Node.TEXT_NODE) { setSlash(null); return; }
    const before = (node.textContent ?? "").slice(0, sel.anchorOffset);
    const m = /(^|\s)\/(\S*)$/.exec(before);
    if (!m) { setSlash(null); return; }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    setSlash({ query: m[2].toLowerCase(), top: rect.bottom || rect.top, left: rect.left });
    setSlashActive(0);
  }

  // Replace the "/partial" token before the caret with the full "/trigger" (the
  // user then presses Enter to expand it, as in the Flow outline).
  function completeSlash(trigger: string) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const node = sel.anchorNode;
    if (!node || node.nodeType !== Node.TEXT_NODE) return;
    const offset = sel.anchorOffset;
    const before = (node.textContent ?? "").slice(0, offset);
    const m = /\/(\S*)$/.exec(before);
    if (!m) return;
    const start = offset - m[0].length;
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, offset);
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand("insertText", false, `/${trigger}`);
    setSlash(null);
    onInput();
  }

  async function clearSpeech() {
    if (!ref.current?.textContent?.trim()) return;
    const ok = await confirm({
      title: "Clear the speech?",
      message: "This clears it for everyone on this flow.",
      confirmLabel: "Clear speech",
      tone: "danger",
    });
    if (!ok) return;
    if (ref.current) ref.current.innerHTML = "";
    latest.current = "";
    save("");
  }

  const slashMatches = slash ? (slash.query.trim() ? fuzzyRank(slash.query, slashOptions) : slashOptions).slice(0, 50) : [];
  const dropOpen = !!slash && slashMatches.length > 0;

  return (
    <div className="flow-speech">
      <div className="flow-speech__bar">
        <button className="db-btn db-btn--glass db-btn--sm" onClick={clearSpeech}>Clear speech</button>
      </div>
      <div className="flow-speech__editwrap">
      <div
        ref={ref}
        className="flow-speech__text"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        data-placeholder="Write your speech here — your partner can edit it too."
        onInput={() => { onInput(); trackCaret(); }}
        onKeyDown={(e) => {
          // Trigger autocomplete navigation while the dropdown is open.
          if (dropOpen) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setSlashActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + slashMatches.length) % slashMatches.length);
              return;
            }
            if (e.key === "Escape") { e.preventDefault(); setSlash(null); return; }
            if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
              e.preventDefault();
              completeSlash(slashMatches[slashActive]?.trigger ?? slashMatches[0].trigger);
              return;
            }
          }
          // Slash command: "/topshelf" alone on a line + Enter inserts its tags.
          if (e.key !== "Enter" || e.shiftKey) return;
          const sel = window.getSelection();
          const an = sel?.anchorNode;
          if (!an || an.nodeType !== Node.TEXT_NODE) return;
          const m = /^\/(\S+)$/.exec((an.textContent ?? "").trim());
          if (!m) return;
          const text = resolveSlashText?.(m[1].toLowerCase());
          if (text == null) return;
          e.preventDefault();
          const range = document.createRange();
          range.selectNodeContents(an);
          sel!.removeAllRanges();
          sel!.addRange(range);
          document.execCommand("insertHTML", false, escapeHtml(text).replace(/\n/g, "<br>"));
          setSlash(null);
          onInput();
        }}
        onKeyUp={(e) => { if (!["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(e.key)) updateSlash(); trackCaret(); }}
        onMouseUp={() => { updateSlash(); trackCaret(); }}
        onFocus={() => { registerInsert(insert); setFocused(true); trackCaret(); }}
        onBlur={() => { save(latest.current); setFocused(false); setTimeout(() => setSlash(null), 120); }}
        onDragOver={(e) => { if (e.dataTransfer.types.includes(FLOW_DRAG_MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
        onDrop={onDropPoint}
      />
      <RemoteCarets editorRef={ref} editors={others} />
      </div>
      {dropOpen && slash && (
        <SlashList matches={slashMatches} active={slashActive} fixed style={{ top: slash.top + 4, left: slash.left }} onPick={completeSlash} />
      )}
    </div>
  );
}
