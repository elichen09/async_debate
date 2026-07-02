// Shared types + column definitions for the collaborative flow sheets.
// The 8 columns mirror debate.fish's PF speech order (Pro-first, canonical).

export interface FlowColumn {
  label: string;          // short header shown in the grid
  full: string;           // full speech name (title attr)
  side: "pro" | "con";
}

export const FLOW_COLUMNS: FlowColumn[] = [
  { label: "PC",  full: "Pro Constructive", side: "pro" },
  { label: "CC",  full: "Con Constructive", side: "con" },
  { label: "PR",  full: "Pro Rebuttal",     side: "pro" },
  { label: "CR",  full: "Con Rebuttal",     side: "con" },
  { label: "PS",  full: "Pro Summary",      side: "pro" },
  { label: "CS",  full: "Con Summary",      side: "con" },
  { label: "PFF", full: "Pro Final Focus",  side: "pro" },
  { label: "CFF", full: "Con Final Focus",  side: "con" },
];

export interface Flow {
  id: string;
  owner_id: string;
  title: string;
  side: "aff" | "neg" | null;
  folder_id: string | null;
  speech_body: string;
  created_at: string;
  updated_at: string;
}

export interface FlowFolder {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
}

// A node in the flow outline. `row_index` is the global vertical order (float,
// so inserts never renumber) and `depth` is the indent level (0-based).
export interface FlowCell {
  id: string;
  flow_id: string;
  col: number;
  row_index: number;
  depth: number;
  highlighted: boolean;
  content: string;
  status?: string | null;   // dropped | extended | turn | answered | conceded
  updated_by: string | null;
  updated_at: string;
}

// A formatted run/paragraph captured from a .docx so the Send doc can rebuild it
// with its original highlight / color / font.
export interface RichRun {
  text: string;
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  color?: string;      // hex RRGGBB
  highlight?: string;  // named highlight (yellow, green, …)
  font?: string;
  size?: number;       // half-points
}
export interface RichParagraph {
  runs: RichRun[];
}

// One Heading-4 point inside an extension: its tag (flowed) + formatted body.
export interface ExtensionPoint {
  tag: string;
  rich: RichParagraph[];
}

// An extension = a header section (e.g. "Topshelf"). Using it adds each point's
// tag as a new flow point and queues the points' cards into the Send doc.
export interface FlowSnippet {
  id: string;
  owner_id: string;
  label: string;                        // the section/extension name
  body: string;                         // plain text of the whole section (preview)
  points: ExtensionPoint[] | null;      // Heading-4 points; null for a manual one-liner
  shortcut: string | null;              // user-assigned key combo, e.g. "alt+f"
  parent_id: string | null;             // groups "---AT: X" sub-blocks under their parent block
  folder_id?: string | null;            // optional library folder this block lives in
  sort_order?: number | null;           // manual drag order among siblings
  created_at: string;
}

// A user folder for organizing blocks in the Extensions library.
export interface FlowSnippetFolder {
  id: string;
  owner_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

// An editor (a grid cell or the speech area) registers this on focus so the
// snippet library can insert text into whatever the user last touched.
export type EditorInsert = (text: string) => void;

// One option in the "/trigger" autocomplete: the block's shortcut + name, a small
// chip (its "---tag" speech suffix like "1NC", else the trigger), and a nesting
// depth so sub-blocks indent under their parent.
export interface SlashOption {
  trigger: string;
  label: string;
  chip?: string;
  depth?: number;
}

// Cross-pane drag of flow points: when split-screening you can drag a point (and
// its sub-points) from one flow into another, or onto the Speech tab. The dragged
// group rides the native dataTransfer so a different pane (a separate component
// instance) can read it. Depths are normalized so the shallowest point is 0.
export const FLOW_DRAG_MIME = "application/x-debate-flow";
export interface FlowDragPoint {
  content: string;
  depth: number;            // relative to the dragged group (top point = 0)
  highlighted?: boolean;
  status?: string | null;
}
export interface FlowDragPayload {
  sourceFlowId: string;
  points: FlowDragPoint[];
}

// The two indent colors the outline alternates by depth (mirrors --c0/--c1 CSS).
// Shared so Copy and cross-pane drag write the same color-coding into the Speech doc.
// Neutral ink + slate to match the monochrome flow theme (and read on white paper).
export const FLOW_DEPTH_COLORS = ["#1f2024", "#6a7180"];

// ── Outline numbering (1. / a. / i., cycling by depth) ───────────────────────
// Shared between the live grid and the snapshot viewer so both number the same way.
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
export function nodeLabel(count: number, depth: number): string {
  const k = depth % 3;
  if (k === 0) return `${count}.`;
  if (k === 1) return `${toAlpha(count)}.`;
  return `${toRoman(count)}.`;
}
