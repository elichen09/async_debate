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
