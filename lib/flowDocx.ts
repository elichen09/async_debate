// Export a flow folder (every flow's outline + speech, plus the shared send doc)
// to a downloadable .docx. Runs entirely in the browser; the `docx` dependency is
// only pulled in when an export happens (page.tsx dynamic-imports this on demand).
//
// Rich HTML (the Speech + Send doc) converts via sendDocExport's shared
// converter, so the send doc here matches the Read view's standalone download
// exactly — highlights, colors, fonts, sizes, and alignment all survive.
import { Document, Packer, Paragraph, TextRun, AlignmentType } from "docx";
import { htmlToDocxParagraphs } from "@/lib/sendDocExport";
import { nodeLabel, type FlowCell } from "@/app/flow/shared";

// Half-point sizes (docx unit). BODY is the base; bump it to scale everything.
const BODY = 26;            // 13pt body / outline / speech

function htmlToParagraphs(html: string): Paragraph[] {
  const out = html && html.trim() ? htmlToDocxParagraphs(html) : [];
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
