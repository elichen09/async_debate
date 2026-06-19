import type { ExtensionPoint, RichParagraph, RichRun } from "@/app/flow/shared";

// Word's named highlight colors → CSS, so the Send doc editor shows real
// highlighting on its white "paper" surface.
const HL: Record<string, string> = {
  yellow: "#ffff00", green: "#00ff00", cyan: "#00ffff", magenta: "#ff00ff",
  blue: "#0000ff", red: "#ff0000", darkBlue: "#00008b", darkCyan: "#008b8b",
  darkGreen: "#006400", darkMagenta: "#8b008b", darkRed: "#8b0000",
  darkYellow: "#808000", lightGray: "#d3d3d3", black: "#000000", white: "#ffffff",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function runHtml(r: RichRun): string {
  let t = esc(r.text);
  if (r.bold) t = `<b>${t}</b>`;
  if (r.italics) t = `<i>${t}</i>`;
  if (r.underline) t = `<u>${t}</u>`;
  const styles: string[] = [];
  if (r.color) styles.push(`color:#${r.color}`);
  if (r.highlight) styles.push(`background-color:${HL[r.highlight] ?? r.highlight}`);
  if (r.font) styles.push(`font-family:'${r.font}'`);
  if (r.size) styles.push(`font-size:${r.size / 2}pt`);
  return styles.length ? `<span style="${styles.join(";")}">${t}</span>` : t;
}

function richToHtml(rich: RichParagraph[]): string {
  return rich.map((p) => `<p>${p.runs.map(runHtml).join("") || "&nbsp;"}</p>`).join("");
}

// A formatted card: tag as a heading + its body paragraphs. When the card came
// from a "/trigger" in the flow, `cellId` tags it so deleting that flow point can
// remove this card from the Send doc.
export function cardHtml(tag: string, rich: RichParagraph[], cellId?: string): string {
  const attr = cellId ? ` data-cell="${esc(cellId)}"` : "";
  return `<h4${attr}>${esc(tag)}</h4>${richToHtml(rich)}`;
}

// A plain (manually-typed) extension: tag + plain body.
export function plainCardHtml(tag: string, body: string): string {
  const paras = body.split(/\n{2,}/).map((p) => `<p>${esc(p.trim()) || "&nbsp;"}</p>`).join("");
  return `<h4>${esc(tag)}</h4>${paras}`;
}

// A whole block for the Send doc: the block name as a centered, underlined Heading
// 3, then its points (each tag a Heading 4 + body). `cellIds[i]` ties point i to
// the flow point it created (for delete-sync); cellIds[0] also tags the title.
export function blockToHtml(
  label: string,
  points: ExtensionPoint[] | null,
  body: string,
  cellIds?: string[],
): string {
  const blockAttr = cellIds?.[0] ? ` data-block="${esc(cellIds[0])}"` : "";
  const title = `<h3${blockAttr} style="text-align:center"><u>${esc(label)}</u></h3>`;
  if (points && points.length) return title + points.map((p, i) => cardHtml(p.tag, p.rich, cellIds?.[i])).join("");
  const paras = body.split(/\n{2,}/).map((p) => `<p>${esc(p.trim()) || "&nbsp;"}</p>`).join("");
  return title + paras;
}
