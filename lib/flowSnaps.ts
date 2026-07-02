// Per-flow snapshot history: freeze a copy of the outline at a moment you mark
// (typically the end of a speech) so you can scrub back to "what the flow looked
// like after the rebuttal". Snapshots read the flow's local mirror (the same one
// the offline outbox hydrates from), so taking one works with no connection —
// and, like that mirror, they live on this device only.

import type { FlowCell } from "@/app/flow/shared";
import { loadSnapshot } from "@/lib/flowSync";

export interface FlowSnap {
  id: string;
  label: string;
  at: number;              // epoch ms when taken
  cells: FlowCell[];       // frozen copy, sorted top-to-bottom
}

const KEY_PREFIX = "flow.speechsnaps.";   // + flowId
const MAX_SNAPS = 24;                     // a round is 8 speeches; keep a few rounds
const isBrowser = typeof window !== "undefined";

export function listSnaps(flowId: string): FlowSnap[] {
  if (!isBrowser) return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY_PREFIX + flowId) || "[]");
    return Array.isArray(raw) ? (raw as FlowSnap[]) : [];
  } catch {
    return [];
  }
}

function persist(flowId: string, snaps: FlowSnap[]) {
  try { localStorage.setItem(KEY_PREFIX + flowId, JSON.stringify(snaps)); } catch { /* quota */ }
}

// Freeze the flow as it stands. Returns the snapshot, or null when the flow's
// local mirror is empty (nothing to freeze yet).
export function takeSnap(flowId: string, label: string): FlowSnap | null {
  if (!isBrowser) return null;
  const cells = loadSnapshot<FlowCell>(flowId);
  if (!cells || !cells.length) return null;
  const snap: FlowSnap = {
    id: crypto.randomUUID(),
    label: label.trim() || "Snapshot",
    at: Date.now(),
    cells: [...cells].sort((a, b) => a.row_index - b.row_index),
  };
  persist(flowId, [snap, ...listSnaps(flowId)].slice(0, MAX_SNAPS));
  return snap;
}

export function deleteSnap(flowId: string, id: string): FlowSnap[] {
  const next = listSnaps(flowId).filter((s) => s.id !== id);
  persist(flowId, next);
  return next;
}
