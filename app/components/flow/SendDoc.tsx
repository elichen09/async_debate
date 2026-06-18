"use client";

import { useEffect, useRef, useState } from "react";
import { downloadHtmlAsDocx } from "@/lib/sendDocExport";

interface SendDocProps {
  html: string;
  version: number;          // bumped when an extension appends, to re-sync the DOM
  onChange: (html: string) => void;
  resolveSlashHtml?: (trigger: string) => string | null;
}

interface OutlineItem { text: string; level: number; }

// Full-area rich editor for the Send doc with a Google-Docs-style outline. The
// contentEditable renders card formatting, accepts pasted rich text, and exports
// the live HTML to .docx. Uncontrolled: innerHTML is set only on external appends
// (version) so typing never loses the caret.
export default function SendDoc({ html, version, onChange, resolveSlashHtml }: SendDocProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [fullscreen, setFullscreen] = useState(false);

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

  function jump(i: number) {
    const hs = ref.current?.querySelectorAll("h1,h2,h3,h4,h5,h6");
    hs?.[i]?.scrollIntoView({ behavior: "smooth", block: "start" });
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
        <div className="flow-sendedit__fmt" role="group" aria-label="Align">
          {([["justifyLeft", "⯇", "Align left"], ["justifyCenter", "≡", "Align center"], ["justifyRight", "⯈", "Align right"]] as const).map(([cmd, glyph, lbl]) => (
            <button key={cmd} className="flow-fmt-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => align(cmd)} title={lbl} aria-label={lbl}>
              {glyph}
            </button>
          ))}
        </div>
        <span className="flow-sendedit__spacer" />
        <button className="db-btn db-btn--accent db-btn--sm" onClick={() => downloadHtmlAsDocx(ref.current?.innerHTML ?? html)}>
          ⬇ Download .docx
        </button>
        <button className="db-btn db-btn--glass db-btn--sm" onClick={clear}>Clear</button>
        <button className="db-btn db-btn--glass db-btn--sm" onClick={() => setFullscreen((f) => !f)}>
          {fullscreen ? "⤡ Exit" : "⤢ Fullscreen"}
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

        <div
          ref={ref}
          className="flow-sendedit__doc"
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          onKeyDown={(e) => {
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
            if (ref.current) onChange(ref.current.innerHTML);
            refreshOutline();
          }}
          onInput={(e) => { onChange((e.target as HTMLDivElement).innerHTML); refreshOutline(); }}
          data-placeholder="Use an extension while flowing, paste cards, or type here…"
        />
      </div>
    </div>
  );
}
