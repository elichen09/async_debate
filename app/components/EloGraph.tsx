"use client";

import { useMemo, useRef, useState } from "react";
import type { EloPoint } from "@/lib/elo";

const W = 640;
const H = 240;
const PAD_X = 10;
const PAD_TOP = 22;
const PAD_BOTTOM = 18;

interface Props {
  points: EloPoint[];
  /** Re-runs the draw animation when this changes (e.g. selected player id). */
  drawKey: string;
}

export default function EloGraph({ points, drawKey }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    const elos = points.map(p => p.elo);
    const min = Math.min(...elos);
    const max = Math.max(...elos);
    const span = Math.max(max - min, 40);
    const lo = min - span * 0.12;
    const hi = max + span * 0.12;
    const x = (i: number) =>
      points.length === 1
        ? W / 2
        : PAD_X + (i / (points.length - 1)) * (W - PAD_X * 2);
    const y = (elo: number) =>
      PAD_TOP + (1 - (elo - lo) / (hi - lo)) * (H - PAD_TOP - PAD_BOTTOM);
    const coords = points.map((p, i) => ({ cx: x(i), cy: y(p.elo) }));
    const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.cx.toFixed(1)},${c.cy.toFixed(1)}`).join(" ");
    const area = `${line} L${coords[coords.length - 1].cx.toFixed(1)},${H} L${coords[0].cx.toFixed(1)},${H} Z`;
    const peak = Math.max(...elos);
    const peakY = y(peak);
    return { coords, line, area, peak, peakY, min, max };
  }, [points]);

  function onMove(e: React.PointerEvent) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestDist = Infinity;
    geo.coords.forEach((c, i) => {
      const d = Math.abs(c.cx - px);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    setHover(best);
  }

  const h = hover !== null ? points[hover] : null;
  const hc = hover !== null ? geo.coords[hover] : null;

  if (points.length < 2) {
    return (
      <div className="gh-graph gh-graph--empty">
        <p className="gh-graph__empty-line">No ranked rounds yet.</p>
        <p className="gh-graph__empty-sub">The graph draws itself after the first judged round.</p>
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className="gh-graph"
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
    >
      <svg
        key={drawKey}
        viewBox={`0 0 ${W} ${H}`}
        className="gh-graph__svg"
        role="img"
        aria-label={`Elo over ${points.length - 1} ranked rounds, from ${points[0].elo} to ${points[points.length - 1].elo}, peak ${geo.peak}`}
      >
        <defs>
          <linearGradient id="gh-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.34" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Peak marker */}
        <line
          x1={PAD_X} x2={W - PAD_X} y1={geo.peakY} y2={geo.peakY}
          className="gh-graph__peakline"
        />
        <text x={W - PAD_X} y={geo.peakY - 6} textAnchor="end" className="gh-graph__peaklabel">
          peak {geo.peak}
        </text>

        <path d={geo.area} fill="url(#gh-area)" className="gh-graph__area" />
        <path d={geo.line} pathLength={1} className="gh-graph__line" />

        {/* Hover crosshair */}
        {hc && (
          <line x1={hc.cx} x2={hc.cx} y1={PAD_TOP - 8} y2={H} className="gh-graph__cross" />
        )}

        {geo.coords.map((c, i) => {
          const p = points[i];
          return (
            <circle
              key={i}
              cx={c.cx}
              cy={c.cy}
              r={hover === i ? 5 : p.won === null ? 3 : 3.2}
              className={`gh-graph__dot ${
                p.won === null ? "gh-graph__dot--start" : p.won ? "gh-graph__dot--win" : "gh-graph__dot--loss"
              }`}
              style={{ animationDelay: `${0.9 + i * (0.5 / points.length)}s` }}
            />
          );
        })}
      </svg>

      {/* Edge labels */}
      <div className="gh-graph__axis">
        <span>{points[0].date ? new Date(points[0].date).toLocaleDateString(undefined, { month: "short", year: "2-digit" }) : "start"}</span>
        <span>{points.length - 1} ranked round{points.length - 1 !== 1 ? "s" : ""}</span>
        <span>now</span>
      </div>

      {/* Tooltip */}
      {h && hc && (
        <div
          className="gh-graph__tip"
          style={{
            left: `${(hc.cx / W) * 100}%`,
            top: `${(hc.cy / H) * 100}%`,
          }}
        >
          <p className="gh-graph__tip-elo">
            {h.elo}
            {h.won !== null && (
              <span className={h.delta >= 0 ? "is-gain" : "is-dip"}>
                {h.delta >= 0 ? `+${h.delta}` : h.delta}
              </span>
            )}
          </p>
          <p className="gh-graph__tip-label">{h.label}</p>
          <p className="gh-graph__tip-sub">
            {h.sub}
            {h.won !== null && <b className={h.won ? "is-gain" : "is-dip"}> · {h.won ? "W" : "L"}</b>}
            {h.date && <> · {new Date(h.date).toLocaleDateString()}</>}
          </p>
        </div>
      )}
    </div>
  );
}
