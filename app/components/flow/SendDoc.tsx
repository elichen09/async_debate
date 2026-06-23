"use client";

import { useEffect, useRef, useState } from "react";
import { downloadHtmlAsDocx } from "@/lib/sendDocExport";
import { usePanePresence } from "@/lib/presence";
import { caretOffsetIn } from "@/lib/caret";
import { fuzzyRank } from "@/lib/fuzzy";
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, Download, Maximize2, Minimize2 } from "lucide-react";
import RemoteCarets from "@/app/components/flow/RemoteCarets";

interface SendDocProps {
  html: string;
  version: number;          // bumped when an extension appends, to re-sync the DOM
  onChange: (html: string) => void;
  resolveSlashHtml?: (trigger: string) => string | null;
  slashOptions?: { trigger: string; label: string }[];
  flowId?: string;
  userId?: string;
  userName?: string;
}

interface OutlineItem { text: string; level: number; }

// Full-area rich editor for the Send doc with a Google-Docs-style outline. The
// contentEditable renders card formatting, accepts pasted rich text, and exports
// the live HTML to .docx. Uncontrolled: innerHTML is set only on external appends
// (version) so typing never loses the caret.
export default function SendDoc({ html, version, onChange, resolveSlashHtml, slashOptions = [], flowId = "", userId = "", userName = "Partner" }: SendDocProps) {
  const ref = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [fullscreen, setFullscreen] = useState(false);
  // Slash autocomplete (mirrors FlowSpeech): the partial "/trigger" being typed at
  // the caret + its screen position, plus the highlighted suggestion.
  const [slash, setSlash] = useState<{ query: string; top: number; left: number } | null>(null);
  const [slashActive, setSlashActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const [myCaret, setMyCaret] = useState<number | null>(null);
  const others = usePanePresence(flowId, "send", userId, userName, focused, focused ? myCaret : null);
  const trackCaret = () => { const el = ref.current; if (!el) return; const off = caretOffsetIn(el); setMyCaret((prev) => (off === prev ? prev : off)); };

  // Track the caret reliably while focused (see FlowSpeech for why).
  useEffect(() => {
    if (!focused) return;
    const read = () => { const el = ref.current; if (!el) return; const off = caretOffsetIn(el); setMyCaret((prev) => (off === prev ? prev : off)); };
    read();
    document.addEventListener("selectionchange", read);
    return () => document.removeEventListener("selectionchange", read);
  }, [focused]);

  function refreshOutline() {
    const el = ref.current;
    if (!el) return;
    const hs = Array.from(el.querySelectorAll("h1,h2,h3,h4,h5,h6"));
    setOutline(hs.map((h) => ({ text: (h.textContent || "(untitled)").trim(), level: parseInt(h.tagName[1], 10) })));
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.innerHTML !== html) {
      el.innerHTML = html;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    refreshOutline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  // In fullscreen, drop the site nav/rail so the doc has the whole screen.
  useEffect(() => {
    document.body.classList.toggle("flow-send-full", fullscreen);
    return () => document.body.classList.remove("flow-send-full");
  }, [fullscreen]);

  function jump(i: number) {
    const hs = ref.current?.querySelectorAll("h1,h2,h3,h4,h5,h6");
    hs?.[i]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Wrap the current selection in a span at the chosen point size (round-trips to
  // .docx via the export walker, which reads inline font-size). The native <select>
  // steals focus and collapses the live selection, so we use the range captured on
  // its mousedown.
  function setFontSize(pt: string) {
    const sel = window.getSelection();
    const live = sel && sel.rangeCount > 0 && !sel.isCollapsed ? sel.getRangeAt(0) : null;
    const range = live ?? savedRange.current;
    if (!pt || !range || range.collapsed) return;
    const span = document.createElement("span");
    span.style.fontSize = `${pt}pt`;
    try {
      span.appendChild(range.extractContents());
      range.insertNode(span);
      const ns = window.getSelection();
      ns?.removeAllRanges();
      const r = document.createRange();
      r.selectNodeContents(span);
      ns?.addRange(r);
    } catch {
      return;
    }
    savedRange.current = null;
    if (ref.current) onChange(ref.current.innerHTML);
    refreshOutline();
  }

  function clear() {
    if (ref.current) ref.current.innerHTML = "";
    onChange("");
    setOutline([]);
  }

  // Format the block containing the caret as a heading (h1-h4) or body (p).
  function format(tag: string) {
    ref.current?.focus();
    document.execCommand("formatBlock", false, tag);
    if (ref.current) onChange(ref.current.innerHTML);
    refreshOutline();
  }

  // Align the block containing the caret.
  function align(cmd: string) {
    ref.current?.focus();
    document.execCommand(cmd, false);
    if (ref.current) onChange(ref.current.innerHTML);
  }

  // Toggle bold/italic/underline on the current selection.
  function style(cmd: string) {
    ref.current?.focus();
    document.execCommand(cmd, false);
    if (ref.current) onChange(ref.current.innerHTML);
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

  // Replace the "/partial" token before the caret with the full "/trigger"; the
  // user then presses Enter to expand it into the card (handled in onKeyDown).
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
    if (ref.current) onChange(ref.current.innerHTML);
  }

  const slashMatches = slash ? fuzzyRank(slash.query, slashOptions).slice(0, 50) : [];
  const dropOpen = !!slash && slashMatches.length > 0;

  return (
    <div className={`flow-sendedit ${fullscreen ? "flow-sendedit--full" : ""}`}>
      <div className="flow-sendedit__bar">
        <div className="flow-sendedit__fmt" role="group" aria-label="Heading level">
          {([["h1", "H1"], ["h2", "H2"], ["h3", "H3"], ["h4", "H4"], ["p", "Body"]] as const).map(([tag, lbl]) => (
            <button
              key={tag}
              className="flow-fmt-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => format(tag)}
              title={`Format as ${lbl}`}
            >
              {lbl}
            </button>
          ))}
        </div>
        <div className="flow-sendedit__fmt" role="group" aria-label="Style">
          {([["bold", Bold, "Bold (Ctrl+B)"], ["italic", Italic, "Italic (Ctrl+I)"], ["underline", Underline, "Underline (Ctrl+U)"]] as const).map(([cmd, Icon, lbl]) => (
            <button key={cmd} className={`flow-fmt-btn flow-fmt-btn--${cmd}`} onMouseDown={(e) => e.preventDefault()} onClick={() => style(cmd)} title={lbl} aria-label={lbl}>
              <Icon size={14} />
            </button>
          ))}
        </div>
        <div className="flow-sendedit__fmt" role="group" aria-label="Align">
          {([["justifyLeft", AlignLeft, "Align left"], ["justifyCenter", AlignCenter, "Align center"], ["justifyRight", AlignRight, "Align right"]] as const).map(([cmd, Icon, lbl]) => (
            <button key={cmd} className="flow-fmt-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => align(cmd)} title={lbl} aria-label={lbl}>
              <Icon size={14} />
            </button>
          ))}
        </div>
        <select
          className="flow-fmt-sel"
          defaultValue=""
          title="Font size (select text first)"
          aria-label="Font size"
          onMouseDown={() => {
            const sel = window.getSelection();
            savedRange.current = sel && sel.rangeCount > 0 && !sel.isCollapsed ? sel.getRangeAt(0).cloneRange() : null;
          }}
          onChange={(e) => { setFontSize(e.target.value); e.currentTarget.value = ""; }}
        >
          <option value="" disabled>Size</option>
          {[9, 10, 11, 12, 13, 14, 16, 18, 20, 24].map((n) => (
            <option key={n} value={n}>{n} pt</option>
          ))}
        </select>
        <span className="flow-sendedit__spacer" />
        <button className="db-btn db-btn--accent db-btn--sm" onClick={() => downloadHtmlAsDocx(ref.current?.innerHTML ?? html)}>
          <Download size={15} /> Download .docx
        </button>
        <button className="db-btn db-btn--glass db-btn--sm" onClick={clear}>Clear</button>
        <button className="db-btn db-btn--glass db-btn--sm" onClick={() => setFullscreen((f) => !f)}>
          {fullscreen ? <><Minimize2 size={14} /> Exit</> : <><Maximize2 size={14} /> Fullscreen</>}
        </button>
      </div>

      <div className="flow-sendedit__row">
        <nav className="flow-sendedit__outline" aria-label="Outline">
          <p className="flow-sendedit__outline-title">Outline</p>
          {outline.length === 0 ? (
            <p className="flow-sendedit__outline-empty">Headings appear here.</p>
          ) : (
            outline.map((o, i) => (
              <button
                key={i}
                className={`flow-sendedit__outline-item lvl${o.level}`}
                style={{ paddingLeft: 6 + (o.level - 1) * 12 }}
                onClick={() => jump(i)}
                title={o.text}
              >
                {o.text}
              </button>
            ))
          )}
        </nav>

        <div className="flow-sendedit__docwrap">
        <div
          ref={ref}
          className="flow-sendedit__doc"
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          onKeyDown={(e) => {
            // While the autocomplete is open, the arrows/Enter/Tab/Escape drive it.
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
            // Slash command: "/topshelf" alone on a line + Enter inserts that card here.
            if (e.key !== "Enter" || e.shiftKey) return;
            const sel = window.getSelection();
            const an = sel?.anchorNode;
            if (!an || an.nodeType !== Node.TEXT_NODE) return;
            const m = /^\/(\S+)$/.exec((an.textContent ?? "").trim());
            if (!m) return;
            const card = resolveSlashHtml?.(m[1].toLowerCase());
            if (!card) return;
            e.preventDefault();
            const range = document.createRange();
            range.selectNodeContents(an);
            sel!.removeAllRanges();
            sel!.addRange(range);
            document.execCommand("insertHTML", false, card);
            setSlash(null);
            if (ref.current) onChange(ref.current.innerHTML);
            refreshOutline();
          }}
          onInput={(e) => { onChange((e.target as HTMLDivElement).innerHTML); refreshOutline(); trackCaret(); }}
          onKeyUp={(e) => { if (!["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(e.key)) updateSlash(); trackCaret(); }}
          onMouseUp={() => { updateSlash(); trackCaret(); }}
          onFocus={() => { setFocused(true); trackCaret(); }}
          onBlur={() => { setFocused(false); setTimeout(() => setSlash(null), 120); }}
          data-placeholder="Use an extension while flowing, paste cards, or type here…"
        />
        <RemoteCarets editorRef={ref} editors={others} />
        </div>
      </div>

      {dropOpen && slash && (
        <ul className="flow-slash flow-slash--fixed" role="listbox" style={{ top: slash.top + 4, left: slash.left }}>
          {slashMatches.map((o, i) => (
            <li key={o.trigger} role="option" aria-selected={i === slashActive}>
              <button
                type="button"
                ref={i === slashActive ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                className={`flow-slash__opt ${i === slashActive ? "is-active" : ""}`}
                onMouseDown={(e) => { e.preventDefault(); completeSlash(o.trigger); }}
              >
                <span className="flow-slash__trig">/{o.trigger}</span>
                <span className="flow-slash__label">{o.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
