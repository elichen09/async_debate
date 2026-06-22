// Map a contentEditable caret to a plain character offset (and back to a screen
// position), so collaborators' cursors can be drawn at the same spot. The editors
// share identical HTML (it's synced), so a global text-offset is consistent across
// clients regardless of window size.

// Characters of text before the caret within `el`, or null if the caret isn't in it.
export function caretOffsetIn(el: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return null;
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

// Position (relative to `el`'s top-left) of a given text offset. Measures a
// 1-character range and takes its edge — a *collapsed* range's getBoundingClientRect
// is unreliable (often returns an empty rect), which would pin the caret to (0,0).
export function rectForOffset(el: HTMLElement, offset: number): { left: number; top: number; height: number } | null {
  const host = el.getBoundingClientRect();
  const lineH = parseFloat(getComputedStyle(el).lineHeight) || 18;

  // Locate the text node + local offset for the global character offset.
  let remaining = Math.max(0, offset);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node: Text | null = null;
  let localOff = 0;
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const len = (n.textContent ?? "").length;
    if (remaining <= len) { node = n as Text; localOff = remaining; break; }
    remaining -= len;
  }

  const measure = (tn: Text, a: number, b: number, edge: "left" | "right") => {
    const r = document.createRange();
    try { r.setStart(tn, a); r.setEnd(tn, b); } catch { return null; }
    const rects = r.getClientRects();
    const rr = rects.length ? rects[rects.length - 1] : r.getBoundingClientRect();
    if (!rr || (rr.width === 0 && rr.height === 0)) return null;
    return { left: (edge === "right" ? rr.right : rr.left) - host.left, top: rr.top - host.top, height: rr.height || lineH };
  };

  if (node) {
    const len = (node.textContent ?? "").length;
    if (localOff > 0) { const m = measure(node, localOff - 1, localOff, "right"); if (m) return m; }
    if (len > 0) { const m = measure(node, Math.min(localOff, len - 1), Math.min(localOff + 1, len), "left"); if (m) return m; }
  }
  // Empty editor / no text — anchor at the content start.
  return { left: 2, top: 2, height: lineH };
}
