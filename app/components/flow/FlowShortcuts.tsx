"use client";

import { useEffect } from "react";

// Surfaces the workspace's hidden power features (slash triggers, flow switching,
// split, fullscreen) so they're discoverable. Opened with "?".
const GROUPS: { title: string; rows: { keys: string[]; desc: string }[] }[] = [
  {
    title: "Flowing",
    rows: [
      { keys: ["/", "trigger", "↵"], desc: "Insert an extension's points and queue its cards into the Send doc" },
      { keys: ["Tab"], desc: "Indent a point a level deeper" },
      { keys: ["⇧", "Tab"], desc: "Outdent a point" },
    ],
  },
  {
    title: "Navigating",
    rows: [
      { keys: ["Alt", "←"], desc: "Previous flow in this folder" },
      { keys: ["Alt", "→"], desc: "Next flow in this folder" },
    ],
  },
  {
    title: "Workspace",
    rows: [
      { keys: ["＋"], desc: "Split: open another view or flow side-by-side (next to the tabs)" },
      { keys: ["⋯"], desc: "Tools & panels: Extensions, Share, Timers, Fullscreen" },
      { keys: ["?"], desc: "Open this shortcuts list" },
      { keys: ["Esc"], desc: "Close a panel, menu, or dialog" },
    ],
  },
];

export default function FlowShortcuts({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="flow-rtcal-backdrop" onClick={onClose} role="presentation">
      <div className="flow-rtcal flow-keys" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
        <span className="flow-rtcal__step">Keyboard shortcuts</span>
        <h3>Move faster in the flow</h3>
        <div className="flow-keys__groups">
          {GROUPS.map((g) => (
            <div className="flow-keys__group" key={g.title}>
              <div className="flow-keys__gtitle">{g.title}</div>
              {g.rows.map((r, i) => (
                <div className="flow-keys__row" key={i}>
                  <span className="flow-keys__combo">
                    {r.keys.map((k, j) => <kbd key={j}>{k}</kbd>)}
                  </span>
                  <span className="flow-keys__desc">{r.desc}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="flow-rtcal__actions">
          <button className="db-btn db-btn--accent db-btn--sm" onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>
  );
}
