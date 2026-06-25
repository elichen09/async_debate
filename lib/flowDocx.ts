// Export a flow (outline + speech + send doc) to a downloadable .docx.
// Runs entirely in the browser; the `docx` dependency is only pulled in when an
// export actually happens (page.tsx dynamic-imports this module on demand).
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import type { FlowCell } from "@/app/flow/shared";

// ── Outline numbering (mirrors FlowGrid's 1. / a. / i. by depth) ──────────────
function toAlpha(n: number): string {
  let s = "";
  while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
}
function toRoman(n: number): string {
  const map: [number, string][] = [[1000,"m"],[900,"cm"],[500,"d"],[400,"cd"],[100,"c"],[90,"xc"],[50,"l"],[40,"xl"],[10,"x"],[9,"ix"],[5,"v"],[4,"iv"],[1,"i"]];
  let r = "";
  for (const [v, s] of map) while (n >= v) { r += s; n -= v; }
  return r;
}
function nodeLabel(count: number, depth: number): string {
  const k = depth % 3;
  if (k === 0) return `${count}.`;
  if (k === 1) return `${toAlpha(count)}.`;
  return `${toRoman(count)}.`;
}

// ── HTML → docx (handles the Speech contentEditable + Send doc rich HTML) ─────
type Fmt = { bold?: boolean; italics?: boolean; underline?: boolean; color?: string; highlight?: "yellow" };
const BLOCK = new Set(["div", "p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "section"]);

function cssToHex(c: string | undefined): string {
  if (!c) return "";
  c = c.trim().toLowerCase();
  if (c.startsWith("#")) {
    let h = c.slice(1);
    if (h.length === 3) h = h.split("").map((x) => x + x).join("");
    return /^[0-9a-f]{6}$/.test(h) ? h : "";
  }
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (m) {
    const parts = m[1].split(",").map((x) => parseInt(x.trim(), 10));
    if (parts.length < 3 || parts.slice(0, 3).some((n) => Number.isNaN(n))) return "";
    return parts.slice(0, 3).map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
  }
  return "";
}

function run(text: string, fmt: Fmt, extra?: { break?: number }): TextRun {
  return new TextRun({
    text,
    bold: fmt.bold,
    italics: fmt.italics,
    underline: fmt.underline ? {} : undefined,
    color: fmt.color,
    highlight: fmt.highlight,
    ...extra,
  });
}

function collectRuns(node: Node, fmt: Fmt): TextRun[] {
  const runs: TextRun[] = [];
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? "";
      if (text) runs.push(run(text, fmt));
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === "br") { runs.push(new TextRun({ break: 1 })); return; }
    const next: Fmt = { ...fmt };
    if (tag === "b" || tag === "strong") next.bold = true;
    if (tag === "i" || tag === "em") next.italics = true;
    if (tag === "u") next.underline = true;
    const color = cssToHex(el.style?.color); if (color) next.color = color;
    const bg = el.style?.backgroundColor; if (bg && bg !== "transparent" && cssToHex(bg)) next.highlight = "yellow";
    runs.push(...collectRuns(el, next));
  });
  return runs;
}

function headingFor(tag: string) {
  switch (tag) {
    case "h1": return HeadingLevel.HEADING_1;
    case "h2": return HeadingLevel.HEADING_2;
    case "h3": return HeadingLevel.HEADING_3;
    case "h4": return HeadingLevel.HEADING_4;
    case "h5": return HeadingLevel.HEADING_5;
    case "h6": return HeadingLevel.HEADING_6;
    default: return undefined;
  }
}

function pushBlock(node: Node, out: Paragraph[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const t = node.textContent ?? "";
    if (t.trim()) out.push(new Paragraph({ children: [new TextRun(t)] }));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === "br") { out.push(new Paragraph({})); return; }
  // A wrapper holding its own block children: recurse so each becomes a paragraph.
  const hasBlockKids = Array.from(el.childNodes).some((n) => n.nodeType === Node.ELEMENT_NODE && BLOCK.has((n as Element).tagName.toLowerCase()));
  if (hasBlockKids && !/^h[1-6]$/.test(tag)) {
    el.childNodes.forEach((c) => pushBlock(c, out));
    return;
  }
  const runs = collectRuns(el, {});
  if (!runs.length) { if (!headingFor(tag)) out.push(new Paragraph({})); return; }
  out.push(new Paragraph({
    children: runs,
    heading: headingFor(tag),
    alignment: tag === "h3" ? AlignmentType.CENTER : undefined,  // Send doc centers block titles
    spacing: { after: 80 },
  }));
}

function htmlToParagraphs(html: string): Paragraph[] {
  const out: Paragraph[] = [];
  if (html && html.trim()) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.body.childNodes.forEach((n) => pushBlock(n, out));
  }
  if (!out.length) out.push(new Paragraph({ children: [new TextRun({ text: "(empty)", italics: true, color: "888888" })] }));
  return out;
}

// Old speeches were stored as plain text; mirror FlowSpeech's toHtml().
function speechToHtml(stored: string): string {
  if (!stored) return "";
  return /<[a-z!/][\s\S]*>/i.test(stored)
    ? stored
    : stored.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
}

const DEPTH_HEX = ["1f2024", "6a7180"]; // matches the on-screen --c0 / --c1 levels
function outlineToParagraphs(cells: FlowCell[]): Paragraph[] {
  const ordered = [...cells].sort((a, b) => a.row_index - b.row_index);
  if (!ordered.length) return [new Paragraph({ children: [new TextRun({ text: "(no points)", italics: true, color: "888888" })] })];
  const counters: number[] = [];
  return ordered.map((cell) => {
    counters[cell.depth] = (counters[cell.depth] || 0) + 1;
    counters.length = cell.depth + 1; // reset deeper counters under a new parent
    const color = DEPTH_HEX[cell.depth % 2];
    return new Paragraph({
      indent: { left: cell.depth * 360 }, // 360 twips = 0.25" per level
      spacing: { after: 40 },
      children: [
        new TextRun({ text: `${nodeLabel(counters[cell.depth], cell.depth)} `, bold: true, color }),
        new TextRun({ text: cell.content || "", color, highlight: cell.highlighted ? "yellow" : undefined }),
      ],
    });
  });
}

function sectionHeading(text: string, breakBefore = false): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: breakBefore,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text })],
  });
}

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
}

export interface FlowExport {
  title: string;
  cells: FlowCell[];
  speechBody: string;
  sendHtml: string;
}

// Build the .docx and trigger a download. Sections: Flow, Speech, Send doc.
export async function exportFlowDocx({ title, cells, speechBody, sendHtml }: FlowExport): Promise<void> {
  const children: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: title || "Flow" })] }),
    sectionHeading("Flow"),
    ...outlineToParagraphs(cells),
    sectionHeading("Speech", true),
    ...htmlToParagraphs(speechToHtml(speechBody)),
    sectionHeading("Send doc", true),
    ...htmlToParagraphs(sendHtml),
  ];

  const doc = new Document({
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitize(title) || "flow"}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
