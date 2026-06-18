import { Document, Packer, Paragraph, HeadingLevel, TextRun, ShadingType, AlignmentType } from "docx";

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

interface Fmt { bold?: boolean; italics?: boolean; underline?: boolean; color?: string; fill?: string; font?: string; size?: number; }
const BLOCK = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote"]);

function inlineRuns(node: Node, fmt: Fmt, out: TextRun[]) {
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? "";
      if (text) out.push(new TextRun({
        text, bold: fmt.bold, italics: fmt.italics, underline: fmt.underline ? {} : undefined,
        color: fmt.color, font: fmt.font, size: fmt.size,
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
    if (tag === "u") nf.underline = true;
    const st = el.style;
    if (st.color) nf.color = hex(st.color) ?? nf.color;
    if (st.backgroundColor) nf.fill = hex(st.backgroundColor) ?? nf.fill;
    if (st.fontFamily) nf.font = st.fontFamily.replace(/['"]/g, "").split(",")[0].trim();
    if (st.fontSize) { const pt = parseFloat(st.fontSize); if (pt) nf.size = Math.round(pt * 2); }
    if (st.fontWeight === "bold" || parseInt(st.fontWeight, 10) >= 600) nf.bold = true;
    inlineRuns(el, nf, out);
  });
}

function hasBlockChild(el: HTMLElement): boolean {
  return Array.from(el.children).some((c) => BLOCK.has(c.tagName.toLowerCase()));
}
function headingFor(tag: string) {
  const m = /^h([1-6])$/.exec(tag);
  if (!m) return undefined;
  return ([HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
    HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6])[parseInt(m[1], 10) - 1];
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
      const runs: TextRun[] = [];
      inlineRuns(el, {}, runs);
      paras.push(new Paragraph({ children: runs, heading: headingFor(tag), alignment: alignFor(el) }));
    } else {
      walk(el, paras); // spans/wrappers: descend to find blocks
    }
  });
}

// Parse the Send doc's HTML and download it as a .docx with formatting intact.
export async function downloadHtmlAsDocx(html: string, filename = "send-doc.docx") {
  const dom = new DOMParser().parseFromString(html || "", "text/html");
  const paras: Paragraph[] = [];
  walk(dom.body, paras);
  if (!paras.length) paras.push(new Paragraph({ text: "" }));

  const doc = new Document({
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } }, // Calibri 11pt default
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
