// Export a flow folder (every flow's outline + speech, plus the shared send doc)
// to a downloadable .docx. Runs entirely in the browser; the `docx` dependency is
// only pulled in when an export happens (page.tsx dynamic-imports this on demand).
import { Document, Packer, Paragraph, TextRun, AlignmentType } from "docx";
import type { FlowCell } from "@/app/flow/shared";

// Half-point sizes (docx unit). BODY is the base; bump it to scale everything.
const BODY = 26;            // 13pt body / outline / speech
const H = { h1: 36, h2: 32, h3: 30, h4: 30, h5: 28, h6: 28 } as const;

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
// Headings render as explicit bold/sized black runs (NOT Word's built-in Heading
// styles) so the download keeps the on-screen look instead of Word's blue theme.
type Fmt = { bold?: boolean; italics?: boolean; underline?: boolean; color?: string; size?: number; highlight?: "yellow" };
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
    size: fmt.size,
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
  const isHeading = /^h[1-6]$/.test(tag);
  // A non-heading wrapper holding its own block children: recurse so each becomes
  // its own paragraph instead of one flattened blob.
  if (!isHeading) {
    const hasBlockKids = Array.from(el.childNodes).some(
      (n) => n.nodeType === Node.ELEMENT_NODE && BLOCK.has((n as Element).tagName.toLowerCase()),
    );
    if (hasBlockKids) { el.childNodes.forEach((c) => pushBlock(c, out)); return; }
  }
  const headFmt: Fmt = isHeading ? { bold: true, size: H[tag as keyof typeof H] } : {};
  const runs = collectRuns(el, headFmt);
  if (!runs.length) { if (!isHeading) out.push(new Paragraph({})); return; }
  out.push(new Paragraph({
    children: runs,
    alignment: tag === "h3" ? AlignmentType.CENTER : undefined,  // Send doc centers block titles
    spacing: isHeading ? { before: 120, after: 60 } : { after: 80 },
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

function heading(text: string, size: number, opts: { center?: boolean; pageBreakBefore?: boolean } = {}): Paragraph {
  return new Paragraph({
    pageBreakBefore: opts.pageBreakBefore,
    alignment: opts.center ? AlignmentType.CENTER : undefined,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size })],
  });
}

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
}

export interface FlowExport {
  title: string;       // doc title (folder name, or the single flow's title)
  sendHtml: string;    // the folder-shared send doc
  flows: { title: string; speechBody: string; cells: FlowCell[] }[];
}

// Build the .docx and trigger a download. One section per flow (outline + speech),
// then the shared Send doc.
export async function exportFlowDocx({ title, flows, sendHtml }: FlowExport): Promise<void> {
  const multi = flows.length > 1;
  const children: Paragraph[] = [heading(title || "Flow", 44)];

  flows.forEach((f, i) => {
    children.push(heading(multi ? f.title : "Flow", multi ? 36 : 32, { pageBreakBefore: multi && i > 0 }));
    children.push(...outlineToParagraphs(f.cells));
    children.push(heading("Speech", 30));
    children.push(...htmlToParagraphs(speechToHtml(f.speechBody)));
  });

  children.push(heading("Send doc", 34, { pageBreakBefore: true }));
  children.push(...htmlToParagraphs(sendHtml));

  const doc = new Document({
    styles: { default: { document: { run: { font: "Calibri", size: BODY } } } },
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
