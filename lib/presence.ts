"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

// A short, stable color per collaborator (keyed off their user id).
const PRESENCE_COLORS = ["#e0704f", "#6f9bea", "#5fbf8f", "#c98bdb", "#e0b84f", "#5fc7d6"];
export function colorFor(uid: string): string {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return PRESENCE_COLORS[h % PRESENCE_COLORS.length];
}

export type RemoteEditor = { uid: string; name: string; color: string };

type PaneMsg = { uid: string; name: string; color: string; scope: string };
const TTL = 6000;
const BEAT = 2000;

// Show who else is present in a given pane scope (e.g. "speech" / "send") of a
// flow, via Realtime broadcast + heartbeat. `active` reports our own presence
// (typically: the pane is mounted/visible). Returns the OTHER users present.
export function usePanePresence(flowId: string, scope: string, userId: string, userName: string, active: boolean): RemoteEditor[] {
  const [editors, setEditors] = useState<RemoteEditor[]>([]);
  const chRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const subscribed = useRef(false);
  const seen = useRef<Map<string, { name: string; color: string; ts: number }>>(new Map());
  const nameRef = useRef(userName);
  const activeRef = useRef(active);
  useEffect(() => { nameRef.current = userName; }, [userName]);
  useEffect(() => { activeRef.current = active; }, [active]);

  useEffect(() => {
    if (!userId || !flowId) return;
    const map = seen.current;
    const color = colorFor(userId);
    const ch = supabase.channel(`flow_pane:${flowId}:${scope}`);
    const rebuild = () => {
      const cutoff = Date.now() - TTL;
      const out: RemoteEditor[] = [];
      for (const [uid, e] of map) {
        if (e.ts < cutoff) { map.delete(uid); continue; }
        out.push({ uid, name: e.name, color: e.color });
      }
      out.sort((a, b) => a.uid.localeCompare(b.uid));
      setEditors((prev) => {
        const sig = out.map((e) => e.uid).join(",");
        const prevSig = prev.map((e) => e.uid).join(",");
        return sig === prevSig ? prev : out;
      });
    };
    const announce = () => {
      if (!subscribed.current || !activeRef.current) return;
      ch.send({ type: "broadcast", event: "here", payload: { uid: userId, name: nameRef.current, color, scope } as PaneMsg });
    };
    ch.on("broadcast", { event: "here" }, ({ payload }) => {
      const p = payload as PaneMsg;
      if (!p || p.uid === userId) return;
      map.set(p.uid, { name: p.name, color: p.color, ts: Date.now() });
      rebuild();
    });
    ch.on("broadcast", { event: "bye" }, ({ payload }) => {
      const p = payload as PaneMsg;
      if (!p || p.uid === userId) return;
      map.delete(p.uid);
      rebuild();
    });
    ch.subscribe((status) => { if (status === "SUBSCRIBED") { subscribed.current = true; announce(); } });
    chRef.current = ch;
    const beat = setInterval(() => { announce(); rebuild(); }, BEAT);
    return () => {
      clearInterval(beat);
      subscribed.current = false;
      ch.send({ type: "broadcast", event: "bye", payload: { uid: userId, name: nameRef.current, color, scope } as PaneMsg });
      chRef.current = null;
      map.clear();
      setEditors([]);
      supabase.removeChannel(ch);
    };
  }, [flowId, scope, userId]);

  // Re-announce promptly when we become active/inactive.
  useEffect(() => {
    if (!chRef.current || !subscribed.current) return;
    if (active) chRef.current.send({ type: "broadcast", event: "here", payload: { uid: userId, name: nameRef.current, color: colorFor(userId), scope } as PaneMsg });
    else chRef.current.send({ type: "broadcast", event: "bye", payload: { uid: userId, name: nameRef.current, color: colorFor(userId), scope } as PaneMsg });
  }, [active, userId, scope]);

  return editors;
}
