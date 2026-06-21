"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

// A clock counts down `remaining` ms; while running we store an absolute `endsAt`
// so every collaborator computes the same value from their own wall clock.
type Clock = { running: boolean; endsAt: number | null; remaining: number };
interface TState {
  rev: number;
  mainDur: number; main: Clock;
  prepDur: number; pro: Clock; con: Clock;
}

const MIN = 60_000;
const idle = (ms: number): Clock => ({ running: false, endsAt: null, remaining: ms });
function initial(): TState {
  return { rev: 0, mainDur: 4 * MIN, main: idle(4 * MIN), prepDur: 3 * MIN, pro: idle(3 * MIN), con: idle(3 * MIN) };
}
function clockMs(c: Clock): number {
  return c.running && c.endsAt != null ? Math.max(0, c.endsAt - Date.now()) : Math.max(0, c.remaining);
}
function fmt(ms: number): string {
  const t = Math.ceil(ms / 1000);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}
function start(c: Clock): Clock {
  const rem = clockMs(c);
  return rem <= 0 ? c : { running: true, endsAt: Date.now() + rem, remaining: rem };
}
function pause(c: Clock): Clock {
  return { running: false, endsAt: null, remaining: clockMs(c) };
}

// Shared per-flow speech + prep timers, pinned under the header. State syncs over a
// Realtime broadcast channel (ephemeral — no schema); a fresh tab requests the
// current state on join, and we re-render on a local tick to count down smoothly.
export default function FlowTimers({ flowId }: { flowId: string }) {
  const [st, setSt] = useState<TState>(initial);
  const stRef = useRef(st);
  const chRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const subscribed = useRef(false);
  const [, force] = useState(0);
  useEffect(() => { stRef.current = st; }, [st]);

  useEffect(() => {
    const ch = supabase.channel(`flow_timer:${flowId}`);
    ch.on("broadcast", { event: "state" }, ({ payload }) => {
      const next = payload as TState;
      if (next && typeof next.rev === "number") setSt(next);
    });
    ch.on("broadcast", { event: "req" }, () => {
      if (subscribed.current) ch.send({ type: "broadcast", event: "state", payload: stRef.current });
    });
    ch.subscribe((status) => { if (status === "SUBSCRIBED") { subscribed.current = true; ch.send({ type: "broadcast", event: "req", payload: {} }); } });
    chRef.current = ch;
    const tick = setInterval(() => force((n) => n + 1), 250);
    return () => { clearInterval(tick); subscribed.current = false; chRef.current = null; supabase.removeChannel(ch); };
  }, [flowId]);

  // Apply a change locally and broadcast it to collaborators.
  function commit(update: (s: TState) => TState) {
    setSt((prev) => {
      const next = { ...update(prev), rev: prev.rev + 1 };
      stRef.current = next;
      chRef.current?.send({ type: "broadcast", event: "state", payload: next });
      return next;
    });
  }

  const adjustMain = (delta: number) => commit((s) => {
    const dur = Math.max(MIN, Math.min(60 * MIN, s.mainDur + delta));
    return { ...s, mainDur: dur, main: idle(dur) };
  });

  const prep = (label: string, accent: string, key: "pro" | "con") => {
    const clock = st[key];
    const ms = clockMs(clock);
    return (
      <div className={`flow-timer ${clock.running ? "is-running" : ""} ${ms === 0 ? "is-done" : ""} ${ms <= 30_000 && ms > 0 ? "is-low" : ""}`}>
        <span className="flow-timer__label" style={{ color: accent }}>{label}</span>
        <span className="flow-timer__time">{fmt(ms)}</span>
        <button className="flow-timer__btn" onClick={() => commit((s) => ({ ...s, [key]: s[key].running ? pause(s[key]) : start(s[key]) }))} title={clock.running ? "Pause" : "Start"}>{clock.running ? "⏸" : "▶"}</button>
        <button className="flow-timer__btn" onClick={() => commit((s) => ({ ...s, [key]: idle(s.prepDur) }))} title="Reset">↺</button>
      </div>
    );
  };

  const mainMs = clockMs(st.main);
  return (
    <div className="flow-timers" role="group" aria-label="Timers">
      <div className={`flow-timer flow-timer--main ${st.main.running ? "is-running" : ""} ${mainMs === 0 ? "is-done" : ""} ${mainMs <= 30_000 && mainMs > 0 ? "is-low" : ""}`}>
        <button className="flow-timer__adj" onClick={() => adjustMain(-MIN)} title="−1 min" aria-label="Decrease">−</button>
        <span className="flow-timer__label">Speech</span>
        <span className="flow-timer__time">{fmt(mainMs)}</span>
        <button className="flow-timer__adj" onClick={() => adjustMain(MIN)} title="+1 min" aria-label="Increase">+</button>
        <button className="flow-timer__btn" onClick={() => commit((s) => ({ ...s, main: s.main.running ? pause(s.main) : start(s.main) }))}>{st.main.running ? "⏸" : "▶"}</button>
        <button className="flow-timer__btn" onClick={() => commit((s) => ({ ...s, main: idle(s.mainDur) }))} title="Reset">↺</button>
      </div>
      {prep("Pro prep", "#6f9bea", "pro")}
      {prep("Con prep", "#e0704f", "con")}
    </div>
  );
}
