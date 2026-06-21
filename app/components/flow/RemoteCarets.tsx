"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { rectForOffset } from "@/lib/caret";
import type { RemoteEditor } from "@/lib/presence";

type Caret = { uid: string; left: number; top: number; height: number; name: string; color: string };

// Draws collaborators' live cursors (a colored caret + name label) over a
// contentEditable, positioned from each editor's character offset. Mount this as a
// sibling of the editor inside a position:relative wrapper that overlays it.
export default function RemoteCarets({ editorRef, editors }: { editorRef: React.RefObject<HTMLElement | null>; editors: RemoteEditor[] }) {
  const [carets, setCarets] = useState<Caret[]>([]);
  const raf = useRef<number | null>(null);

  // Measure each remote caret's screen position (and re-measure on scroll/resize).
  useLayoutEffect(() => {
    const el = editorRef.current;
    const compute = () => {
      if (!el) { setCarets([]); return; }
      const out: Caret[] = [];
      for (const e of editors) {
        if (e.caret == null) continue;
        const pos = rectForOffset(el, e.caret);
        if (pos) out.push({ uid: e.uid, left: pos.left, top: pos.top, height: pos.height, name: e.name, color: e.color });
      }
      setCarets(out);
    };
    compute();
    if (!el) return;
    const onMove = () => { if (raf.current) return; raf.current = requestAnimationFrame(() => { raf.current = null; compute(); }); };
    el.addEventListener("scroll", onMove, { passive: true });
    window.addEventListener("resize", onMove);
    return () => { el.removeEventListener("scroll", onMove); window.removeEventListener("resize", onMove); if (raf.current) cancelAnimationFrame(raf.current); };
  }, [editors, editorRef]);

  return (
    <div className="flow-carets" aria-hidden="true">
      {carets.map((c) => (
        <div key={c.uid} className="flow-caret" style={{ left: c.left, top: c.top, height: c.height, background: c.color }}>
          <span className="flow-caret__label" style={{ background: c.color }}>{c.name}</span>
        </div>
      ))}
    </div>
  );
}
