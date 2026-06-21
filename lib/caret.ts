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

// Position (relative to `el`'s top-left visible corner) of a given text offset.
export function rectForOffset(el: HTMLElement, offset: number): { left: number; top: number; height: number } | null {
  let remaining = Math.max(0, offset);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let target: { node: Text; off: number } | null = null;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const len = (node.textContent ?? "").length;
    if (remaining <= len) { target = { node: node as Text, off: remaining }; break; }
    remaining -= len;
  }
  const range = document.createRange();
  if (target) { range.setStart(target.node, target.off); range.collapse(true); }
  else { range.selectNodeContents(el); range.collapse(false); }
  const rect = range.getBoundingClientRect();
  const host = el.getBoundingClientRect();
  const lineH = parseFloat(getComputedStyle(el).lineHeight) || 18;
  if (rect.height === 0 && rect.left === 0 && rect.top === 0) {
    // Empty editor / no text node — anchor at the editor's content start.
    return { left: 2, top: 2, height: lineH };
  }
  return { left: rect.left - host.left, top: rect.top - host.top, height: rect.height || lineH };
}
