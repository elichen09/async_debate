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

// A section header's nesting depth is its run of leading dashes — three per level.
// No dashes = a top-level block ("AT: Arctic"), "---" = a sub-block ("---Topshelf"),
// "------" = a sub-sub-block ("------AT: Pabst Evid"), and so on.
function dashLevel(text: string): number {
  const d = /^-+/.exec(text)?.[0].length ?? 0;
  return d === 0 ? 0 : Math.ceil(d / 3);
}
// Strip the leading dashes (and tidy any inner ones) for a readable label.
function cleanLabel(text: string): string {
  return text.replace(/^-+\s*/, "").replace(/-{2,}/g, " ").replace(/\s+/g, " ").trim() || text;
}

// Split the doc into extensions at each header (Heading 1-3). The header text names
// the block; Heading-4 paragraphs inside become its points (tag + formatted body),
// running until the next header. A block's nesting level comes from TWO sources,
// added together: (a) its heading level — the shallowest heading used is tier 0,
// the next deeper is tier 1, etc., so a doc that uses Heading 2 for "AT: Arctic"
// and Heading 3 for "AT: Propping up Russia" nests the latter under the former;
// and (b) its run of leading dashes (three per level). A doc that uses one heading
// level throughout still nests purely by dashes, exactly as before.
export async function parseAtSections(
  buf: ArrayBuffer,
): Promise<{ label: string; body: string; points: ExtensionPoint[]; level: number }[]> {
  const { paragraphs, headingLevel } = await load(buf);

  // Map each heading level that's actually used as a section title to a contiguous
  // tier: shallowest → 0, next → 1, … (so H2/H3 → 0/1, but H3-only → 0).
  const used = new Set<number>();
  for (const p of paragraphs) {
    const lvl = headingLevel(p);
    if (lvl >= 1 && lvl <= 3 && clean(p.textContent || "")) used.add(lvl);
  }
  const tierOf = new Map<number, number>();
  [...used].sort((a, b) => a - b).forEach((lvl, i) => tierOf.set(lvl, i));

  const all: { label: string; points: ExtensionPoint[]; level: number }[] = [];
  let sec: (typeof all)[number] | null = null;
  let point: ExtensionPoint | null = null;

  for (const p of paragraphs) {
    const lvl = headingLevel(p);
    const runs = parseRuns(p);
    const text = clean(runs.map((r) => r.text).join(""));

    if (lvl >= 1 && lvl <= 3) {
      if (!text) continue; // skip blank heading lines (spacing/layout, not real blocks)
      const level = (tierOf.get(lvl) ?? 0) + dashLevel(text);
      sec = { label: cleanLabel(text), points: [], level };
      all.push(sec);
      point = null;
    } else if (lvl === 4) {
      if (!text) continue;
      if (!sec) { sec = { label: text.slice(0, 40), points: [], level: 0 }; all.push(sec); }
      point = { tag: text, rich: [] };
      sec.points.push(point);
    } else if (point && runs.length) {
      point.rich.push({ runs });
    }
  }

  // Keep a block only if it (or one of its descendants) actually has cards. This
  // keeps real grouping titles like "AT: Arctic" while dropping empty subtrees, so
  // no blank "Extension" blocks slip through.
  const subtreeHasCards = (i: number): boolean => {
    if (all[i].points.length > 0) return true;
    for (let j = i + 1; j < all.length && all[j].level > all[i].level; j++) {
      if (all[j].points.length > 0) return true;
    }
    return false;
  };
  return all
    .filter((_, i) => subtreeHasCards(i))
    .map((s) => ({
      label: s.label || "Extension",
      body: s.points.map((pt) => pt.tag).join("\n"),
      points: s.points,
      level: s.level,
    }));
}

// Build flow_snippets rows from parsed sections, linking each "child" sub-block to
// the most recent normal block via a client-generated id (so the parent->child
// grouping survives without a second round-trip).
export function rowsFor(
  sections: { label: string; body: string; points: ExtensionPoint[]; level: number }[],
  ownerId: string,
) {
  const slug = (v: string) => v.replace(/[^a-z0-9]/gi, "").toLowerCase();
  // Each block's own trigger name drops a leading "AT" (so "AT: Arctic" → arctic).
  const namePart = (label: string) => slug(label.replace(/^\s*at\b[:.\s-]*/i, "")) || slug(label);
  const idStack: string[] = [];   // most-recent block id at each level
  const trigStack: string[] = []; // most-recent full trigger at each level
  return sections.map((s) => {
    const id = crypto.randomUUID();
    const level = Math.max(0, s.level);
    const parent_id = level > 0 ? (idStack[level - 1] ?? null) : null;
    // Sub-block triggers chain onto the parent's: "/arctic:topshelf:pabst".
    const parentTrig = level > 0 ? (trigStack[level - 1] ?? "") : "";
    const own = namePart(s.label);
    const trigger = parentTrig ? `${parentTrig}:${own}` : own;
    idStack[level] = id; idStack.length = level + 1;
    trigStack[level] = trigger; trigStack.length = level + 1;
    return { id, owner_id: ownerId, label: s.label, body: s.body, points: s.points, shortcut: trigger || null, parent_id };
  });
}

export { richToText };
