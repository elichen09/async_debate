// Client-side .docx parsing for the flow tools. We read the raw OOXML
// (word/document.xml) so we can detect heading levels reliably AND keep run
// formatting (highlight, color, font) — mammoth-style HTML drops those. Nothing
// is uploaded or stored; parsing happens in the browser tab.
import JSZip from "jszip";
import type { ExtensionPoint, RichParagraph, RichRun } from "@/app/flow/shared";

interface Loaded {
  paragraphs: Element[];
  headingLevel: (p: Element) => number; // 1-9, or 0 if not a heading
}

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

async function load(buf: ArrayBuffer): Promise<Loaded> {
  const zip = await JSZip.loadAsync(buf);
  const docXml = await zip.file("word/document.xml")?.async("string");
  if (!docXml) return { paragraphs: [], headingLevel: () => 0 };
  const dom = new DOMParser().parseFromString(docXml, "application/xml");

  // Map style id -> style name (how Word references heading styles).
  const styleNames = new Map<string, string>();
  const stylesXml = await zip.file("word/styles.xml")?.async("string");
  if (stylesXml) {
    const sdom = new DOMParser().parseFromString(stylesXml, "application/xml");
    for (const s of Array.from(sdom.getElementsByTagName("w:style"))) {
      const id = s.getAttribute("w:styleId");
      const name = s.getElementsByTagName("w:name")[0]?.getAttribute("w:val");
      if (id) styleNames.set(id, name || id);
    }
  }

  const headingLevel = (p: Element): number => {
    const id = p.getElementsByTagName("w:pStyle")[0]?.getAttribute("w:val") ?? "";
    if (!id) return 0;
    const name = styleNames.get(id) ?? id;
    const m = /heading\s*([1-9])/i.exec(name) || /heading([1-9])/i.exec(id);
    return m ? parseInt(m[1], 10) : 0;
  };

  return { paragraphs: Array.from(dom.getElementsByTagName("w:p")), headingLevel };
}

function toggleOn(rPr: Element, tag: string): boolean {
  const el = rPr.getElementsByTagName(tag)[0];
  if (!el) return false;
  const val = el.getAttribute("w:val");
  return val == null || !["0", "false", "off"].includes(val);
}

function parseRuns(p: Element): RichRun[] {
  const runs: RichRun[] = [];
  for (const r of Array.from(p.getElementsByTagName("w:r"))) {
    const text = Array.from(r.getElementsByTagName("w:t")).map((t) => t.textContent ?? "").join("");
    if (!text) continue;
    const run: RichRun = { text };
    const rPr = r.getElementsByTagName("w:rPr")[0];
    if (rPr) {
      if (toggleOn(rPr, "w:b")) run.bold = true;
      if (toggleOn(rPr, "w:i")) run.italics = true;
      if (rPr.getElementsByTagName("w:u")[0]) run.underline = true;
      const color = rPr.getElementsByTagName("w:color")[0]?.getAttribute("w:val");
      if (color && color !== "auto") run.color = color;
      const hl = rPr.getElementsByTagName("w:highlight")[0]?.getAttribute("w:val");
      if (hl && hl !== "none") run.highlight = hl;
      const font = rPr.getElementsByTagName("w:rFonts")[0]?.getAttribute("w:ascii");
      if (font) run.font = font;
      const sz = rPr.getElementsByTagName("w:sz")[0]?.getAttribute("w:val");
      if (sz) run.size = parseInt(sz, 10) || undefined;
    }
    runs.push(run);
  }
  return runs;
}

function richToText(rich: RichParagraph[]): string {
  return rich.map((p) => p.runs.map((r) => r.text).join("")).join("\n\n");
}

// Each Heading-4 paragraph becomes one flow point, in document order.
export async function parseFlowHeadings(buf: ArrayBuffer): Promise<string[]> {
  const { paragraphs, headingLevel } = await load(buf);
  return paragraphs
    .filter((p) => headingLevel(p) === 4)
    .map((p) => clean(p.textContent || ""))
    .filter(Boolean);
}

// Split the doc into extensions at each top-level header (Heading 1-3). The
// header text names the extension; Heading-4 paragraphs inside become its points
// (tag + formatted body), running until the next header.
export async function parseAtSections(
  buf: ArrayBuffer,
): Promise<{ label: string; body: string; points: ExtensionPoint[] }[]> {
  const { paragraphs, headingLevel } = await load(buf);
  const sections: { label: string; points: ExtensionPoint[] }[] = [];
  let sec: (typeof sections)[number] | null = null;
  let point: ExtensionPoint | null = null;

  for (const p of paragraphs) {
    const lvl = headingLevel(p);
    const runs = parseRuns(p);
    const text = clean(runs.map((r) => r.text).join(""));

    if (lvl >= 1 && lvl <= 3) {
      sec = { label: text, points: [] };
      sections.push(sec);
      point = null;
    } else if (lvl === 4) {
      if (!sec) { sec = { label: "", points: [] }; sections.push(sec); }
      point = { tag: text, rich: [] };
      sec.points.push(point);
    } else if (point && runs.length) {
      point.rich.push({ runs });
    }
  }

  return sections
    .filter((s) => s.points.length)
    .map((s) => ({
      label: s.label || s.points[0].tag.slice(0, 40) || "Extension",
      body: s.points.map((pt) => pt.tag).join("\n"),
      points: s.points,
    }));
}

export { richToText };
