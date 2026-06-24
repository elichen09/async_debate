"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fuzzyRank, type FuzzyOption } from "@/lib/fuzzy";

// One command in the palette. `trigger` is extra keywords for the fuzzy match (the
// label is matched too); `group` is the little category tag; `hint` is a right-side
// note (e.g. a shortcut). Opened with Ctrl+K / Cmd+K from the workspace.
export interface PaletteCommand extends FuzzyOption {
  trigger: string;   // keywords + unique id
  label: string;     // shown
  group?: string;
  hint?: string;
  run: () => void;
}

export default function FlowPalette({ commands, onClose }: { commands: PaletteCommand[]; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = useMemo(() => (q.trim() ? fuzzyRank(q, commands) : commands), [q, commands]);

  function run(cmd?: PaletteCommand) {
    if (!cmd) return;
    onClose();
    cmd.run();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(results.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); run(results[active]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  }

  return (
    <div className="flow-palette-backdrop" onClick={onClose} role="presentation">
      <div className="flow-palette" role="dialog" aria-modal="true" aria-label="Command palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="flow-palette__input"
          placeholder="Search actions, views, and flows…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          onKeyDown={onKeyDown}
          aria-label="Search commands"
        />
        <ul className="flow-palette__list" role="listbox">
          {results.length === 0 ? (
            <li className="flow-palette__empty">No matches</li>
          ) : results.map((cmd, i) => (
            <li key={cmd.trigger} role="option" aria-selected={i === active}>
              <button
                type="button"
                ref={i === active ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                className={`flow-palette__opt ${i === active ? "is-active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); run(cmd); }}
              >
                {cmd.group && <span className="flow-palette__group">{cmd.group}</span>}
                <span className="flow-palette__label">{cmd.label}</span>
                {cmd.hint && <span className="flow-palette__hint">{cmd.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
