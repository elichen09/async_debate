import { Document, Packer, Paragraph, TextRun, ShadingType, AlignmentType } from "docx";

// Convert a CSS color string (#rgb, #rrggbb, rgb(), or a few names) to docx's
// bare RRGGBB hex.
const NAMED: Record<string, string> = {
  yellow: "FFFF00", green: "008000", lime: "00FF00", cyan: "00FFFF", aqua: "00FFFF",
  magenta: "FF00FF", fuchsia: "FF00FF", blue: "0000FF", red: "FF0000", black: "000000",
  white: "FFFFFF", gray: "808080", grey: "808080",
};
function hex(css?: string | null): string | undefined {
  if (!css) return undefined;
  const c = css.trim().toLowerCase();
  if (NAMED[c]) return NAMED[c];
  let m = /^#([0-9a-f]{6})$/i.exec(c);
  if (m) return m[1].toUpperCase();
  m = /^#([0-9a-f]{3})$/i.exec(c);
  if (m) return m[1].split("").map((x) => x + x).join("").toUpperCase();
  m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(c);
  if (m) return [1, 2, 3].map((i) => parseInt(m![i], 10).toString(16).padStart(2, "0")).join("").toUpperCase();
  return undefined;
}

// Word highlight names keyed by the hex the editor renders them as (richText's HL
// map). Background colors that match one of these export as a REAL Word highlight
// (what debaters actually use) instead of paragraph shading, which looks/prints
// differently.
type Highlight =
  | "yellow" | "green" | "cyan" | "magenta" | "blue" | "red" | "darkBlue" | "darkCyan"
  | "darkGreen" | "darkMagenta" | "darkRed" | "darkYellow" | "lightGray" | "black" | "white";
const HIGHLIGHT_BY_HEX: Record<string, Highlight> = {
  FFFF00: "yellow", "00FF00": "green", "00FFFF": "cyan", FF00FF: "magenta", "0000FF": "blue",
  FF0000: "red", "00008B": "darkBlue", "008B8B": "darkCyan", "006400": "darkGreen",
  "8B008B": "darkMagenta", "8B0000": "darkRed", "808000": "darkYellow", D3D3D3: "lightGray",
  "000000": "black", FFFFFF: "white",
};

interface Fmt { bold?: boolean; italics?: boolean; underline?: boolean; strike?: boolean; color?: string; fill?: string; highlight?: Highlight; font?: string; size?: number; }
const BLOCK = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote"]);

function inlineRuns(node: Node, fmt: Fmt, out: TextRun[]) {
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? "";
      if (text) out.push(new TextRun({
        text, bold: fmt.bold, italics: fmt.italics, underline: fmt.underline ? {} : undefined,
        strike: fmt.strike, color: fmt.color, font: fmt.font, size: fmt.size, highlight: fmt.highlight,
        shading: fmt.fill ? { type: ShadingType.SOLID, color: "auto", fill: fmt.fill } : undefined,
      }));
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === "br") { out.push(new TextRun({ text: "", break: 1 })); return; }
    const nf: Fmt = { ...fmt };
    if (tag === "b" || tag === "strong") nf.bold = true;
    if (tag === "i" || tag === "em") nf.italics = true;
    if (tag === "u" || tag === "ins") nf.underline = true;
    if (tag === "s" || tag === "strike" || tag === "del") nf.strike = true;
    const st = el.style;
    // Browsers' execCommand may emit CSS (font-style/text-decoration/font-weight)
    // instead of <i>/<u>/<b> tags — honor both so nothing is dropped on download.
    if (st.fontStyle === "italic" || st.fontStyle === "oblique") nf.italics = true;
    const td = `${st.textDecorationLine || ""} ${st.textDecoration || ""}`;
    if (td.includes("underline")) nf.underline = true;
    if (td.includes("line-through")) nf.strike = true;
    if (st.color) nf.color = hex(st.color) ?? nf.color;
    if (st.backgroundColor) {
      const fh = hex(st.backgroundColor);
      if (fh) {
        const hl = HIGHLIGHT_BY_HEX[fh];
        if (hl) { nf.highlight = hl; nf.fill = undefined; }   // real highlight
        else { nf.fill = fh; nf.highlight = undefined; }      // arbitrary bg → shading
      }
    }
    if (st.fontFamily) nf.font = st.fontFamily.replace(/['"]/g, "").split(",")[0].trim();
    if (st.fontSize) { const pt = parseFloat(st.fontSize); if (pt) nf.size = Math.round(pt * 2); }
    if (st.fontWeight === "bold" || parseInt(st.fontWeight, 10) >= 600) nf.bold = true;
    inlineRuns(el, nf, out);
  });
}

function hasBlockChild(el: HTMLElement): boolean {
  return Array.from(el.children).some((c) => BLOCK.has(c.tagName.toLowerCase()));
}
// Heading sizes in half-points: H1 20pt, H2 18pt, H3 16pt, H4 13pt.
const HEADING_HALF_PT: Record<number, number> = { 1: 40, 2: 36, 3: 32, 4: 26, 5: 24, 6: 22 };
function headingLevelOf(tag: string): number {
  const m = /^h([1-6])$/.exec(tag);
  return m ? parseInt(m[1], 10) : 0;
}
function alignFor(el: HTMLElement) {
  const a = (el.style.textAlign || el.getAttribute("align") || "").toLowerCase();
  if (a === "center") return AlignmentType.CENTER;
  if (a === "right") return AlignmentType.RIGHT;
  if (a === "justify") return AlignmentType.JUSTIFIED;
  return undefined;
}

function walk(node: Node, paras: Paragraph[]) {
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? "";
      if (text.trim()) paras.push(new Paragraph({ children: [new TextRun(text)] }));
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (BLOCK.has(tag)) {
      if (hasBlockChild(el)) { walk(el, paras); return; }
      const lvl = headingLevelOf(tag);
      // Headings get explicit black Calibri bold at the target size — NOT Word's
      // built-in Heading styles, which can't be overridden and force blue/italic and
      // the wrong size. Inner runs (e.g. a colored span) still win over this base.
      const base: Fmt = lvl ? { bold: true, color: "000000", font: "Calibri", size: HEADING_HALF_PT[lvl] } : {};
      const runs: TextRun[] = [];
      inlineRuns(el, base, runs);
      paras.push(new Paragraph({
        children: runs,
        alignment: alignFor(el),
        spacing: lvl ? { before: 160, after: 80 } : undefined,
      }));
    } else {
      walk(el, paras); // spans/wrappers: descend to find blocks
    }
  });
}

// Rich HTML (Send doc / Speech) → docx paragraphs with formatting intact:
// highlights, colors, fonts, sizes, alignment, and execCommand-style CSS.
// Shared with the full-flow export (flowDocx) so both downloads look the same.
export function htmlToDocxParagraphs(html: string): Paragraph[] {
  const dom = new DOMParser().parseFromString(html || "", "text/html");
  const paras: Paragraph[] = [];
  walk(dom.body, paras);
  return paras;
}

// Parse the Send doc's HTML and download it as a .docx with formatting intact.
export async function downloadHtmlAsDocx(html: string, filename = "send-doc.docx") {
  const paras = htmlToDocxParagraphs(html);
  if (!paras.length) paras.push(new Paragraph({ text: "" }));

  const doc = new Document({
    // Calibri 11pt default; headings carry their own explicit run formatting.
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [{ children: paras }],
  });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".docx") ? filename : `${filename}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
