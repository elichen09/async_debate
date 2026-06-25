"use client";

import type { CSSProperties } from "react";
import type { SlashOption } from "@/app/flow/shared";

// Shared "/trigger" autocomplete list, used by the flow grid, speech, and send
// doc. Each row is a chip (speech tag / shortcut) + the block name, with sub-blocks
// indented under their parent. Keyboard nav (active index) stays in the parent.
export function SlashList({ matches, active, onPick, fixed, style }: {
  matches: SlashOption[];
  active: number;
  onPick: (trigger: string) => void;
  fixed?: boolean;
  style?: CSSProperties;
}) {
  return (
    <ul className={`flow-slash ${fixed ? "flow-slash--fixed" : ""}`} role="listbox" style={style}>
      {matches.map((o, i) => (
        <li key={o.trigger} role="option" aria-selected={i === active}>
          <button
            type="button"
            ref={i === active ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
            className={`flow-slash__opt ${i === active ? "is-active" : ""}`}
            style={o.depth ? { paddingLeft: 8 + o.depth * 16 } : undefined}
            onMouseDown={(e) => { e.preventDefault(); onPick(o.trigger); }}
          >
            {o.chip && <span className="flow-slash__chip">{o.chip}</span>}
            <span className="flow-slash__label">{o.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
