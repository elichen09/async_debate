import type { RichParagraph, RichRun } from "@/app/flow/shared";

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

// A formatted card: tag as a heading + its body paragraphs.
export function cardHtml(tag: string, rich: RichParagraph[]): string {
  return `<h4>${esc(tag)}</h4>${richToHtml(rich)}`;
}

// A plain (manually-typed) extension: tag + plain body.
export function plainCardHtml(tag: string, body: string): string {
  const paras = body.split(/\n{2,}/).map((p) => `<p>${esc(p.trim()) || "&nbsp;"}</p>`).join("");
  return `<h4>${esc(tag)}</h4>${paras}`;
}
