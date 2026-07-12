// Flow templates: a saved copy of a flow's outline that seeds new flows —
// "Save as template" from a flow's tools menu, "From template" in the sidebar.
// Stored per account in Supabase (supabase/flow_templates.sql) so they follow
// you across devices, like the extensions library. Points reuse the cross-pane
// drag shape (content/depth/highlighted/status/ink), depth-normalized so the
// shallowest point is 0.

import { supabase } from "@/lib/supabase";
import type { FlowCell, FlowDragPoint } from "@/app/flow/shared";

export interface FlowTemplate {
  id: string;
  owner_id: string;
  name: string;
  side: "aff" | "neg" | null;
  points: FlowDragPoint[];
  created_at: string;
}

// The columns-missing error every call maps to a run-the-SQL hint.
const MIGRATION_HINT = "run supabase/flow_templates.sql in the Supabase SQL editor first";
function friendly(message: string | undefined): string {
  const m = message ?? "unknown error";
  return /flow_templates|schema cache|relation .* does not exist/i.test(m) ? `Templates aren't set up — ${MIGRATION_HINT}.` : m;
}

export async function listTemplates(): Promise<{ templates: FlowTemplate[]; error: string | null }> {
  const { data, error } = await supabase
    .from("flow_templates")
    .select("id, owner_id, name, side, points, created_at")
    .order("created_at", { ascending: false });
  if (error) return { templates: [], error: friendly(error.message) };
  return { templates: (data ?? []) as FlowTemplate[], error: null };
}

// Freeze the given outline as a template. Cells arrive in any order; they're
// sorted and depth-normalized here so the template replays cleanly anywhere.
export async function saveTemplate(name: string, side: "aff" | "neg" | null, cells: FlowCell[]): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "Your session expired — sign in again.";
  const ordered = [...cells].sort((a, b) => a.row_index - b.row_index);
  const min = ordered.length ? Math.min(...ordered.map((c) => c.depth)) : 0;
  const points: FlowDragPoint[] = ordered.map((c) => ({
    content: c.content,
    depth: c.depth - min,
    highlighted: !!c.highlighted,
    status: c.status ?? null,
    ink: c.ink ?? null,
  }));
  const { error } = await supabase
    .from("flow_templates")
    .insert({ owner_id: user.id, name: name.trim() || "Template", side, points });
  return error ? friendly(error.message) : null;
}

export async function deleteTemplate(id: string): Promise<string | null> {
  const { error } = await supabase.from("flow_templates").delete().eq("id", id);
  return error ? friendly(error.message) : null;
}

// Create a fresh flow seeded with the template's points; returns its id for
// navigation. Mirrors the sidebar's create/import path (a direct insert —
// creating a flow needs a connection anyway).
export async function createFlowFromTemplate(t: FlowTemplate): Promise<{ flowId: string | null; error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { flowId: null, error: "Your session expired — sign in again." };
  const { data: flow, error: insErr } = await supabase
    .from("flows")
    .insert({ owner_id: user.id, title: t.name, side: t.side })
    .select("id")
    .single();
  if (insErr || !flow) return { flowId: null, error: insErr?.message ?? "Could not create flow." };
  const rows = t.points.length
    ? t.points.map((p, i) => ({
        flow_id: flow.id, col: 0, row_index: i, depth: Math.max(0, p.depth),
        content: p.content, highlighted: !!p.highlighted, status: p.status ?? null,
        ink: p.ink ?? null, updated_by: user.id,
      }))
    : [{ flow_id: flow.id, col: 0, row_index: 0, content: "", updated_by: user.id }];
  const { error: cellErr } = await supabase.from("flow_cells").insert(rows);
  // The ink column may be missing (flow_cell_ink.sql not run) — retry without it
  // rather than failing the whole creation over a color.
  if (cellErr && /ink/i.test(cellErr.message)) {
    await supabase.from("flow_cells").insert(rows.map((r) => { const copy = { ...r } as Record<string, unknown>; delete copy.ink; return copy; }));
  }
  return { flowId: flow.id as string, error: null };
}
