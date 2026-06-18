"use client";

import { useEffect, useRef } from "react";
import { downloadHtmlAsDocx } from "@/lib/sendDocExport";

interface SendDocProps {
  html: string;
  version: number;          // bumped when an extension appends, to re-sync the DOM
  onChange: (html: string) => void;
}

// Full-area rich editor for the Send doc. Renders cards with their formatting,
// is freely editable (like the Speech doc), and accepts pasted rich text. The
// live HTML exports to .docx. Uncontrolled contentEditable: we set innerHTML only
// on external appends (version) so typing never loses the caret.
export default function SendDoc({ html, version, onChange }: SendDocProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || el.innerHTML === html) return;
    el.innerHTML = html;
    // Drop the caret at the end so appended cards flow on naturally.
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  function clear() {
    if (ref.current) ref.current.innerHTML = "";
    onChange("");
  }

  return (
    <div className="flow-sendedit">
      <div className="flow-sendedit__bar">
        <button className="db-btn db-btn--accent db-btn--sm" onClick={() => downloadHtmlAsDocx(ref.current?.innerHTML ?? html)}>
          ⬇ Download .docx
        </button>
        <button className="db-btn db-btn--ghost db-btn--sm" onClick={clear}>Clear</button>
        <span className="flow-sendedit__hint">Editable · paste cards in · formatting preserved</span>
      </div>
      <div
        ref={ref}
        className="flow-sendedit__doc"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        data-placeholder="Use an extension while flowing, paste cards, or type here…"
      />
    </div>
  );
}
