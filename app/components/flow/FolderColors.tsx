"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { FLOW_DEPTH_COLORS } from "@/app/flow/shared";

// Per-folder font colors: pick one color for aff flows and one for neg flows,
// applied to every flow in this folder (for everyone who can see it). Leaving
// a side on default keeps the theme's ink/slate pairing.
export default function FolderColors({ aff, neg, supported, onSave, onClose }: {
  aff: string | null;
  neg: string | null;
  supported: boolean;   // false = the aff_color/neg_color columns are missing
  onSave: (aff: string | null, neg: string | null) => void;
  onClose: () => void;
}) {
  // null = "use the default"; a hex string = custom.
  const [a, setA] = useState<string | null>(aff);
  const [n, setN] = useState<string | null>(neg);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const row = (label: string, value: string | null, set: (v: string | null) => void) => (
    <div className="flow-fcolors__row">
      <span className="flow-fcolors__label">{label}</span>
      <input
        type="color"
        className="flow-fcolors__swatch"
        value={value ?? FLOW_DEPTH_COLORS[0]}
        onChange={(e) => set(e.target.value)}
        aria-label={`${label} font color`}
      />
      {value ? (
        <>
          <span className="flow-fcolors__hex">{value}</span>
          <button className="flow-fcolors__reset" onClick={() => set(null)}>Use default</button>
        </>
      ) : (
        <span className="flow-fcolors__hex flow-fcolors__hex--default">default</span>
      )}
    </div>
  );

  return (
    <div className="flow-rtcal-backdrop" onClick={onClose} role="presentation">
      <div className="flow-rtcal flow-fcolors" role="dialog" aria-modal="true" aria-label="Aff and neg font colors" onClick={(e) => e.stopPropagation()}>
        <span className="flow-rtcal__step">This folder</span>
        <h3>Aff &amp; neg font colors</h3>
        <p className="flow-rtcal__sub">
          Points alternate between the two colors by indent, starting with the flow&apos;s own side —
          on an aff flow: 1. aff color, a. neg color, i. aff color… and the reverse on a neg flow.
          Applies to every flow in this folder; flows without a side keep the defaults.
        </p>
        {!supported && (
          <p className="flow-fcolors__err">
            <AlertTriangle size={13} /> The color columns are missing — run supabase/flow_colors.sql in the Supabase SQL editor first.
          </p>
        )}
        {row("Aff flows", a, setA)}
        {row("Neg flows", n, setN)}
        <div className="flow-rtcal__actions">
          <button className="db-btn db-btn--glass db-btn--sm" onClick={onClose}>Cancel</button>
          <button className="db-btn db-btn--accent db-btn--sm" disabled={!supported} onClick={() => { onSave(a, n); onClose(); }}>
            Save colors
          </button>
        </div>
      </div>
    </div>
  );
}
