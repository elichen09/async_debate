// Turn a Send-doc HTML string into a "read doc": the speech-ready version a
// debater actually reads aloud. It keeps the tags (headings) and the author+date
// of each cite, and from every card body keeps ONLY the highlighted text (what
// was marked to be read), dropping all the unhighlighted underlying card.
//
// Per block, in document order, tracking whether we've hit highlighting yet in
// the current card (reset at each heading):
//   - heading (h1-h6)            → kept as-is (it's a tag / block title)
//   - paragraph with highlighting → emit just the highlighted words (the read)
//   - paragraph, no highlight yet in this card → it's the cite: emit its bold
//     text (author + date)
//   - paragraph, no highlight but highlighting already seen → dropped
// So once a card's body starts (first highlight), only highlighted words survive;
// bold-only words in the body are dropped. The cite's author/date (bold, before
// any highlight) is the one place bold is kept.

const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const BLOCK = new Set(["p", "div", "li", "blockquote", "section", "article"]);

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// A background-color counts as a read-highlight unless it's absent/transparent or
// plain white (white "highlight" isn't something you read).
function isHighlightBg(v: string): boolean {
  const c = v.trim().toLowerCase();
  if (!c || c === "transparent" || c === "initial" || c === "inherit" || c === "none") return false;
  if (c === "#fff" || c === "#ffffff" || c === "white" || c === "rgb(255, 255, 255)" || c === "rgb(255,255,255)") return false;
  return true;
}

interface Ctx { hl: boolean; bold: boolean; }

// Build the in-order text of `node`, keeping only runs where `keep(ctx)` holds.
// Dropped text becomes a single space so kept phrases stay separated, while text
// inside one kept run stays contiguous (no spurious mid-word spaces).
function buildText(node: Node, ctx: Ctx, keep: (c: Ctx) => boolean): string {
  let s = "";
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const t = child.textContent ?? "";
      s += keep(ctx) ? t : (t ? " " : "");
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === "br") { s += " "; return; }
    const next: Ctx = { ...ctx };
    if (tag === "b" || tag === "strong") next.bold = true;
    if (tag === "mark") next.hl = true;
    const st = el.style;
    if (st.backgroundColor && isHighlightBg(st.backgroundColor)) next.hl = true;
    if (st.fontWeight === "bold" || parseInt(st.fontWeight, 10) >= 600) next.bold = true;
    s += buildText(el, next, keep);
  });
  return s;
}

function hasBlockChild(el: HTMLElement): boolean {
  return Array.from(el.children).some((c) => {
    const t = c.tagName.toLowerCase();
    return HEADINGS.has(t) || BLOCK.has(t);
  });
}

// Flatten the doc into leaf blocks (headings + paragraphs) in document order,
// descending through wrapper elements so nested structure doesn't merge.
function flatten(node: Node, out: HTMLElement[]) {
  Array.from(node.childNodes).forEach((child) => {
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (HEADINGS.has(tag)) { out.push(el); return; }
    if (hasBlockChild(el)) { flatten(el, out); return; }
    out.push(el);
  });
}

// Transform Send-doc HTML → read-doc HTML. All of a card's highlighted body —
// however many source paragraphs it spanned — is merged into ONE flowing
// paragraph so it reads as prose, not a line-per-fragment poem.
export function toReadDocHtml(html: string): string {
  const dom = new DOMParser().parseFromString(html || "", "text/html");
  const blocks: HTMLElement[] = [];
  flatten(dom.body, blocks);
  const out: string[] = [];
  let body: string[] = [];        // highlighted fragments collected for this card
  const flush = () => {
    const text = norm(body.join(" "));
    if (text) out.push(`<p>${esc(text)}</p>`);
    body = [];
  };
  for (const el of blocks) {
    const tag = el.tagName.toLowerCase();
    if (HEADINGS.has(tag)) {
      flush(); // end the previous card's body before the next tag
      const txt = norm(el.textContent ?? "");
      if (txt) out.push(`<${tag}>${esc(txt)}</${tag}>`);
      continue;
    }
    const base: Ctx = { hl: false, bold: false };
    const read = norm(buildText(el, base, (c) => c.hl));
    if (read) { body.push(read); continue; }            // body → accumulate
    if (body.length === 0) {                             // before any highlight → cite
      const cite = norm(buildText(el, base, (c) => c.bold));
      if (cite) out.push(`<p class="rd-cite"><b>${esc(cite)}</b></p>`);
    }
    // else: an unhighlighted paragraph after the read started → dropped
  }
  flush(); // last card
  return out.join("");
}
