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

export interface FlowCell {
  id: string;
  flow_id: string;
  col: number;
  row_index: number;
  content: string;
  updated_by: string | null;
  updated_at: string;
}

export interface FlowSnippet {
  id: string;
  owner_id: string;
  label: string;
  body: string;
  created_at: string;
}

// An editor (a grid cell or the speech area) registers this on focus so the
// snippet library can insert text into whatever the user last touched.
export type EditorInsert = (text: string) => void;
