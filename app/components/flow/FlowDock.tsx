"use client";

import Link from "next/link";
import { useEffect } from "react";
import SnippetLibrary from "@/app/components/flow/SnippetLibrary";
import ShareDialog from "@/app/components/flow/ShareDialog";
import type { FlowSnippet } from "@/app/flow/shared";

type DockTab = "extensions" | "share";

// One right-side dock for the occasional panels (Extensions, Share) so they share
// a single, consistent surface instead of a panel + a modal. Tabs switch between
// them; the content components render in "embedded" mode (no own chrome).
export default function FlowDock({ tab, onTab, onClose, userId, onUse, snippets, setSnippets, flowId, ownerId }: {
  tab: DockTab;
  onTab: (t: DockTab) => void;
  onClose: () => void;
  userId: string;
  onUse: (s: FlowSnippet) => void;
  snippets: FlowSnippet[];
  setSnippets: React.Dispatch<React.SetStateAction<FlowSnippet[]>>;
  flowId: string;
  ownerId: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside className="flow-dock" aria-label={tab === "extensions" ? "Extensions" : "Share"}>
      <div className="flow-dock__head">
        <div className="flow-dock__tabs" role="tablist">
          <button role="tab" aria-selected={tab === "extensions"} className={`flow-dock__tab ${tab === "extensions" ? "is-active" : ""}`} onClick={() => onTab("extensions")}>Extensions</button>
          <button role="tab" aria-selected={tab === "share"} className={`flow-dock__tab ${tab === "share" ? "is-active" : ""}`} onClick={() => onTab("share")}>Share</button>
        </div>
        <div className="flow-dock__headbtns">
          {tab === "extensions" && (
            <Link className="flow-icon-btn" href="/flow/extensions" title="Open full library" aria-label="Open full library">⤢</Link>
          )}
          <button className="flow-icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
      </div>
      <div className="flow-dock__body">
        {tab === "extensions" ? (
          <SnippetLibrary embedded userId={userId} onClose={onClose} onUse={onUse} snippets={snippets} setSnippets={setSnippets} />
        ) : (
          <ShareDialog embedded flowId={flowId} ownerId={ownerId} userId={userId} onClose={onClose} />
        )}
      </div>
    </aside>
  );
}
