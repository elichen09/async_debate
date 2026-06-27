"use client";

import { useEffect, useState } from "react";
import { onSyncState, type SyncState } from "@/lib/flowSync";

// A quiet trust signal in the workspace header: is your flow saved? When the
// connection drops mid-round it flips to "Offline" so you KNOW your points are still
// being kept (on this device) and will sync the moment you're back — no silent loss.
const META: Record<SyncState, { label: string; title: string }> = {
  synced: { label: "Synced", title: "All changes saved." },
  syncing: { label: "Saving…", title: "Saving your changes." },
  offline: { label: "Offline", title: "No connection — your flow is saved on this device and will sync automatically when you're back online." },
};

export default function SyncStatus() {
  const [state, setState] = useState<SyncState>("synced");
  useEffect(() => onSyncState(setState), []);
  const meta = META[state];
  return (
    <span className={`flow-sync flow-sync--${state}`} title={meta.title} role="status" aria-live="polite">
      <span className="flow-sync__dot" aria-hidden />
      <span className="flow-sync__label">{meta.label}</span>
    </span>
  );
}
