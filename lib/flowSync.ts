// Offline-resilient write queue for the flow sheet.
//
// In a round you can't trust the network: tournament wifi drops, a phone hotspot
// stalls mid-1AR. The flow has to keep working anyway. So every mutation is applied
// to the editor's React state OPTIMISTICALLY by the caller and ALSO enqueued here.
// This module persists the queue to localStorage and flushes it to Supabase in
// order, retrying on failure and auto-flushing the moment the connection returns —
// so a debater keeps flowing through an outage and nothing is lost.
//
// Inserts carry a client-generated id and are sent with upsert(onConflict:id), so a
// retry (or a duplicate from a flaky connection) is idempotent — never a duplicate
// row, never a primary-key error that wedges the queue.

import { supabase } from "@/lib/supabase";

type Row = Record<string, unknown>;

type Op =
  | { kind: "insert"; table: string; id: string; row: Row; seq: number }
  | { kind: "update"; table: string; id: string; patch: Row; seq: number }
  | { kind: "delete"; table: string; ids: string[]; seq: number };

// Same shapes without the queue sequence number, which push() assigns.
type OpInput =
  | { kind: "insert"; table: string; id: string; row: Row }
  | { kind: "update"; table: string; id: string; patch: Row }
  | { kind: "delete"; table: string; ids: string[] };

export type SyncState = "synced" | "syncing" | "offline";

const OUTBOX_KEY = "flow.outbox.v1";
const SNAP_PREFIX = "flow.snap.";          // + flowId
const RETRY_MS = 4000;                      // periodic retry while ops remain
const isBrowser = typeof window !== "undefined";

// ── Outbox state ────────────────────────────────────────────────────────────
let log: Op[] = loadLog();
let seqCounter = log.reduce((m, o) => Math.max(m, o.seq), 0);
let flushing = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(s: SyncState) => void>();

function loadLog(): Op[] {
  if (!isBrowser) return [];
  try {
    const raw = JSON.parse(localStorage.getItem(OUTBOX_KEY) || "[]");
    return Array.isArray(raw) ? (raw as Op[]) : [];
  } catch {
    return [];
  }
}
function persistLog() {
  if (!isBrowser) return;
  try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(log)); } catch { /* quota */ }
}

function online(): boolean {
  return !isBrowser || navigator.onLine !== false;
}

// Current sync state, derived from the queue + connectivity.
export function syncState(): SyncState {
  if (!log.length) return "synced";
  return online() ? "syncing" : "offline";
}
function emit() {
  const s = syncState();
  for (const fn of listeners) fn(s);
}

// Subscribe to sync-state changes; returns an unsubscribe. Fires immediately with
// the current state so a freshly-mounted indicator paints right away.
export function onSyncState(fn: (s: SyncState) => void): () => void {
  listeners.add(fn);
  fn(syncState());
  return () => listeners.delete(fn);
}

// Network errors mean "no connection, keep the op and retry"; everything else is a
// real server rejection (constraint, RLS) we shouldn't loop on forever.
function isNetworkError(err: { message?: string } | null): boolean {
  if (!online()) return true;
  const m = err?.message ?? "";
  return /fetch|network|load failed|timeout|connection/i.test(m);
}

function scheduleRetry() {
  if (retryTimer || !log.length) return;
  retryTimer = setTimeout(() => { retryTimer = null; void flush(); }, RETRY_MS);
}

// ── Enqueue ─────────────────────────────────────────────────────────────────
function push(op: OpInput) {
  log.push({ ...op, seq: ++seqCounter } as Op);
  persistLog();
  emit();
  void flush();
}

export function enqueueInsert(table: string, row: Row & { id: string }) {
  push({ kind: "insert", table, id: row.id, row });
}

// Updates to the same row that are still queued get merged onto the last pending
// op (insert or update) so a burst of keystrokes collapses into one write.
export function enqueueUpdate(table: string, id: string, patch: Row) {
  for (let i = log.length - 1; i >= 0; i--) {
    const o = log[i];
    if (o.table !== table) continue;
    if (o.kind === "insert" && o.id === id) { Object.assign(o.row, patch); o.seq = ++seqCounter; persistLog(); emit(); void flush(); return; }
    if (o.kind === "update" && o.id === id) { Object.assign(o.patch, patch); o.seq = ++seqCounter; persistLog(); emit(); void flush(); return; }
    if (o.kind === "delete" && o.ids.includes(id)) break; // deleted after this point — fall through to a fresh op
    if (o.kind !== "delete") break; // stop at the first non-delete op for another row
  }
  push({ kind: "update", table, id, patch });
}

export function enqueueDelete(table: string, ids: string[]) {
  if (!ids.length) return;
  // Drop still-queued inserts/updates for these ids. If a row was only ever created
  // offline (insert still queued, never sent), it never reached the server, so we can
  // cancel its delete too — nothing to remove server-side.
  const idSet = new Set(ids);
  const neverSent = new Set<string>();
  log = log.filter((o) => {
    if (o.kind === "insert" && idSet.has(o.id)) { neverSent.add(o.id); return false; }
    if (o.kind === "update" && idSet.has(o.id)) return false;
    return true;
  });
  const realIds = ids.filter((id) => !neverSent.has(id));
  if (realIds.length) push({ kind: "delete", table, ids: realIds });
  else { persistLog(); emit(); }
}

// ── Flush ───────────────────────────────────────────────────────────────────
async function runOp(op: Op): Promise<{ error: { message?: string } | null }> {
  if (op.kind === "insert") return supabase.from(op.table).upsert(op.row, { onConflict: "id" });
  if (op.kind === "update") return supabase.from(op.table).update(op.patch).eq("id", op.id);
  return supabase.from(op.table).delete().in("id", op.ids);
}

// Drain the queue in order under a single-flight lock. Stops (and schedules a retry)
// on the first network error; drops an op that the server rejects outright so one
// poison write can't block everything behind it.
export async function flush(): Promise<void> {
  if (flushing) return;
  if (!log.length) { emit(); return; }
  if (!online()) { emit(); scheduleRetry(); return; }
  flushing = true;
  emit();
  try {
    while (log.length) {
      const op = log[0];
      const sentSeq = op.seq;
      let res: { error: { message?: string } | null };
      try { res = await runOp(op); }
      catch (e) { res = { error: { message: (e as Error)?.message ?? "network" } }; }
      if (res.error) {
        if (isNetworkError(res.error)) { scheduleRetry(); break; }
        // Hard rejection (constraint/RLS) — log and drop so one poison write can't
        // block the queue. Drop regardless of any mid-flight merge (it'd reject too).
        console.error(`flowSync: dropping ${op.kind} on ${op.table}:`, res.error.message);
      } else if (log[0] === op && op.seq !== sentSeq) {
        // More edits to this same row merged in while it was in flight — its value
        // changed under us, so re-send with the latest instead of dropping it.
        persistLog();
        continue;
      }
      // Success (or a dropped poison op): remove it. The head only ever changes by
      // shifting here, so index 0 is the op we just processed.
      if (log[0] === op) { log.shift(); persistLog(); }
    }
  } finally {
    flushing = false;
    emit();
    if (log.length) scheduleRetry();
  }
}

// ── Local snapshots (instant hydrate, survives reload offline) ───────────────
export function saveSnapshot(flowId: string, cells: unknown[]) {
  if (!isBrowser) return;
  try { localStorage.setItem(SNAP_PREFIX + flowId, JSON.stringify(cells)); } catch { /* quota */ }
}
export function loadSnapshot<T = unknown>(flowId: string): T[] | null {
  if (!isBrowser) return null;
  try {
    const raw = JSON.parse(localStorage.getItem(SNAP_PREFIX + flowId) || "null");
    return Array.isArray(raw) ? (raw as T[]) : null;
  } catch {
    return null;
  }
}

// Replay the queued ops for one flow over a set of server rows, so a fresh fetch
// reflects unsynced local edits instead of clobbering them. Rows are matched/keyed
// by id; inserts are appended, updates patched, deletes removed.
export function applyPending<T extends { id: string }>(flowId: string, rows: T[]): T[] {
  let out = rows.slice();
  for (const op of log) {
    if (op.table !== "flow_cells") continue;
    if (op.kind === "insert") {
      if ((op.row as { flow_id?: string }).flow_id === flowId && !out.some((r) => r.id === op.id)) out.push(op.row as unknown as T);
    } else if (op.kind === "update") {
      out = out.map((r) => (r.id === op.id ? { ...r, ...(op.patch as Partial<T>) } : r));
    } else {
      const del = new Set(op.ids);
      out = out.filter((r) => !del.has(r.id));
    }
  }
  return out;
}

// ── Connectivity wiring ──────────────────────────────────────────────────────
if (isBrowser) {
  window.addEventListener("online", () => { emit(); void flush(); });
  window.addEventListener("offline", () => emit());
  // A flush attempt on load clears anything stranded by a previous session's outage.
  if (log.length) void flush();
}
