"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// Promise-based confirm dialog so destructive actions get an in-brand prompt
// instead of the OS window.confirm(). Call it from anywhere under the provider:
//   const confirm = useConfirm();
//   if (!(await confirm({ title: "Delete this flow?", tone: "danger" }))) return;
type ConfirmOpts = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
};
type Ask = (o: ConfirmOpts) => Promise<boolean>;

const ConfirmCtx = createContext<Ask>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

export default function FlowConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const ask = useCallback<Ask>((o) => new Promise<boolean>((resolve) => {
    resolver.current = resolve;
    setOpts(o);
  }), []);

  const close = useCallback((v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  }, []);

  useEffect(() => {
    if (!opts) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [opts, close]);

  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      {opts && (
        <div className="flow-rtcal-backdrop" onClick={() => close(false)} role="presentation">
          <div
            className="flow-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-label={opts.title}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="flow-confirm__title">{opts.title}</h3>
            {opts.message && <p className="flow-confirm__msg">{opts.message}</p>}
            <div className="flow-confirm__actions">
              <button className="db-btn db-btn--glass db-btn--sm" onClick={() => close(false)}>
                {opts.cancelLabel ?? "Cancel"}
              </button>
              <button
                className={opts.tone === "danger" ? "db-btn db-btn--sm flow-confirm__danger" : "db-btn db-btn--accent db-btn--sm"}
                onClick={() => close(true)}
                autoFocus
              >
                {opts.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}
